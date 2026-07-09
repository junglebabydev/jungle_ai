import { Prisma, PRODUCT_TYPE } from "@prisma/client";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  mapProductResponseDTO,
  ProductFilter,
  ProductResponseDTO,
  UpdateProductDTO,
} from "../../shared/dtos/ProductDTOs";
import { IProductService } from "./service.interface";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { ProductServiceInternal } from "./service.internal";

async function getProductById(
  id: string | number,
  {
    withCategory,
    withLocation,
  }: { withCategory?: boolean; withLocation?: boolean } = {},
): Promise<ProductResponseDTO> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: Number(id) },
      include: {
        category: withCategory,
        location: withLocation,
      },
    });
    if (!product) throw NotFoundError.Product;

    return mapProductResponseDTO(product, {
      category: product.category,
      location: product.location,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchProduct(`id: ${id}`);
  }
}

async function listProducts(
  filter: ProductFilter,
  {
    withCategory,
    withLocation,
  }: {
    withCategory?: boolean;
    withLocation?: boolean;
  } = {},
): Promise<ProductResponseDTO[]> {
  const { locationId, productType, includeArchived } = filter;

  try {
    const where: Prisma.ProductWhereInput = {};
    const andClauses: Prisma.ProductWhereInput[] = [];

    if (locationId) andClauses.push({ locationId: Number(locationId) });
    if (productType)
      andClauses.push({ productType: productType as PRODUCT_TYPE });

    if (andClauses.length > 0) where.AND = andClauses;

    const products = await prisma.product.findMany({
      where: {
        ...where,
        // Hide archived by default; includeArchived surfaces them (e.g. to restore).
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        category: withCategory,
        location: withLocation,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return products.map((product) =>
      mapProductResponseDTO(product, {
        category: product.category,
        location: product.location,
      }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;

    const by: string[] = [];
    if (locationId) by.push(`locationId: ${locationId}`);
    if (productType) by.push(`productType: ${productType}`);

    throw BadRequestError.FetchProduct(by.join(", "));
  }
}

async function publishProduct(
  id: string | number,
): Promise<ProductResponseDTO> {
  try {
    const product = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Refresh the search index (routed by product type; non-fatal).
    void ProductServiceInternal.reindexForSearch(id);

    return mapProductResponseDTO(product);
  } catch (e) {
    throw BadRequestError.PublishProduct;
  }
}

async function archiveProduct(
  id: string | number,
): Promise<ProductResponseDTO> {
  try {
    const product = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        isPublished: false,
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    // Refresh the search index so the archived camp drops out of search.
    void ProductServiceInternal.reindexForSearch(id);

    return mapProductResponseDTO(product);
  } catch (e) {
    throw BadRequestError.ArchiveProduct;
  }
}

async function updateProduct(
  id: string | number,
  dto: UpdateProductDTO,
): Promise<ProductResponseDTO> {
  const product = await ProductServiceInternal.updateProduct(id, dto);

  void ProductServiceInternal.reindexForSearch(id);

  return mapProductResponseDTO(product);
}

export const ProductService: IProductService = {
  getProductById,
  listProducts,
  publishProduct,
  archiveProduct,
  updateProduct,
};
