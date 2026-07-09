import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { ServiceLocator } from "..";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreateProductCategoryDTO,
  mapProductCategoryResponseDTO,
  ProductCategoryFilter,
  ProductCategoryResonseDTO,
} from "../../shared/dtos/ProductCategoryDTOs";
import { IProductCategoryService } from "./service.interface";

async function createProductCategory(
  dto: CreateProductCategoryDTO,
  {
    locationId,
    merchantId,
  }: { locationId: string | number; merchantId: string | number }
): Promise<ProductCategoryResonseDTO> {
  const { isArchived } = dto;

  try {
    const productCategory = await prisma.productCategory.create({
      data: {
        locationId: Number(locationId),
        merchantId: Number(merchantId),
        name: dto.name,
        description: dto.description,
        thumbnail: dto.thumbnail,
        isArchived,
        archivedAt: isArchived ? new Date() : undefined,
      },
    });

    // Refresh the parent merchant's search doc (its categories changed).
    void ServiceLocator.MerchantService.internal.reindexForSearch(
      productCategory.merchantId,
    );
    // `merchantCategories` is denormalized into every product doc under the
    // merchant, so reindex those products too. Fire-and-forget; reconcile backstop.
    void ServiceLocator.ProductService.internal.reindexProductsForMerchant(
      productCategory.merchantId,
    );

    return mapProductCategoryResponseDTO(productCategory);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateProductCategory;
  }
}

async function getProductCategoryById(
  id: string | number,
  {
    withLocation,
    withMerchant,
  }: { withLocation?: boolean; withMerchant?: boolean } = {}
): Promise<ProductCategoryResonseDTO> {
  try {
    const productCategory = await prisma.productCategory.findUnique({
      where: { id: Number(id) },
      include: {
        location: withLocation,
        merchant: withMerchant,
      },
    });
    if (!productCategory) throw NotFoundError.ProductCategory;

    return mapProductCategoryResponseDTO(productCategory, {
      location: productCategory.location,
      merchant: productCategory.merchant,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchProductCategory(`by id: ${id}`);
  }
}

async function listProductCategorie(
  filter: ProductCategoryFilter,
  {
    withLocation,
    withMerchant,
  }: {
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {}
): Promise<ProductCategoryResonseDTO[]> {
  const { locationId, merchantId } = filter;
  try {
    const where: Prisma.ProductCategoryWhereInput = {};
    const andClauses: Prisma.ProductCategoryWhereInput[] = [];

    if (locationId) andClauses.push({ locationId: Number(locationId) });
    if (merchantId) andClauses.push({ merchantId: Number(merchantId) });

    if (andClauses.length > 0) where.AND = andClauses;

    const productCategories = await prisma.productCategory.findMany({
      where,
      include: {
        location: withLocation,
        merchant: withMerchant,
      },
    });

    return productCategories.map((productCategory) =>
      mapProductCategoryResponseDTO(productCategory, {
        location: productCategory.location,
        merchant: productCategory.merchant,
      })
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;

    const by: string[] = [];
    if (locationId) by.push(`by locationId: ${locationId}`);
    if (merchantId) by.push(`by merchantId: ${merchantId}`);

    throw BadRequestError.FetchProductCategory(by.join(", "));
  }
}

async function archiveProductCategory(
  id: string | number
): Promise<ProductCategoryResonseDTO> {
  try {
    const productCategory = await prisma.productCategory.update({
      where: { id: Number(id) },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    void ServiceLocator.MerchantService.internal.reindexForSearch(
      productCategory.merchantId,
    );
    // `merchantCategories` is denormalized into the merchant's product docs.
    void ServiceLocator.ProductService.internal.reindexProductsForMerchant(
      productCategory.merchantId,
    );

    return mapProductCategoryResponseDTO(productCategory);
  } catch (e) {
    throw BadRequestError.ArchiveProductCategory;
  }
}

export const ProductCategoryService: IProductCategoryService = {
  createProductCategory,
  getProductCategoryById,
  listProductCategorie,
  archiveProductCategory,
};
