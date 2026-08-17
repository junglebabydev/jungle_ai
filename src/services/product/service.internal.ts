import { Prisma, Product, PRODUCT_TYPE } from "@prisma/client";
import {
  CreateProductDTO,
  UpdateProductDTO,
} from "../../shared/dtos/ProductDTOs";
import prisma from "../../config/prisma";
import { searchClient } from "../../lib/searchClient";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { IProductServiceInternal } from "./service.interface";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  PRODUCT_SEARCH_INCLUDE,
  ProductWithRelations,
} from "../../shared/types/product";
import { ServiceLocator } from "..";

/**
 * Map a product to its search collection. All product types are now indexed in
 * the single unified `products` collection (productType is a facet there).
 */
async function createProduct(
  locationId: string | number,
  dto: CreateProductDTO,
  tx?: Prisma.TransactionClient
): Promise<Product> {
  const now = new Date();
  const { isPublished, isArchived } = dto;

  const db = tx ?? prisma;

  try {
    const product = await db.product.create({
      data: {
        locationId: Number(locationId),
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        productType: dto.productType as PRODUCT_TYPE,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        imageUrl: dto.imageUrl,
        thumbnailUrl: dto.thumbnailUrl,
        tags: dto.tags,
        highlights: dto.highlights,
        bookingRequired: dto.bookingRequired,
        isPublished,
        publishedAt: isPublished ? now : undefined,
        isArchived,
        archivedAt: isArchived ? now : undefined,
        slug: dto.slug,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
    });

    return product;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateProduct;
  }
}

async function findProductById(id: string | number): Promise<Product | null> {
  return await prisma.product.findUnique({ where: { id: Number(id) } });
}

async function findProductByIdExtended(
  id: string | number,
): Promise<ProductWithRelations | null> {
  return await prisma.product.findUnique({
    where: { id: Number(id) },
    include: PRODUCT_SEARCH_INCLUDE,
  });
}

/**
 * Refetch the product with its denormalized relations and upsert it into the
 * search collection for its type. Non-fatal — a search failure must never break
 * the originating write. Must be called AFTER the owning transaction commits
 * (it reads the committed row); the periodic reconcile is the backstop.
 */
async function reindexForSearch(id: string | number): Promise<void> {
  // The search service loads the row from the shared database itself; we just
  // tell it which document changed. Fire-and-forget (never throws).
  await searchClient.reindex("products", id);
}

/**
 * A location's denormalized fields (sgDistrict/sgRegion/name/locationType/tags)
 * feed every product doc at that location, so a location edit must reindex those
 * products. Non-fatal — a search failure must never break the originating write.
 * Must be called AFTER the owning transaction commits.
 */
async function reindexProductsForLocation(
  locationId: string | number,
): Promise<void> {
  try {
    const products = await prisma.product.findMany({
      where: { locationId: Number(locationId) },
      select: { id: true },
    });

    await Promise.all(products.map((p) => reindexForSearch(p.id)));
  } catch (e) {
    console.warn(
      `[typesense] reindex products for location ${locationId} failed: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
}

/**
 * A merchant's denormalized fields (`merchantName`, `merchantCategories`) feed
 * every product doc under that merchant, so a merchant edit — or a category
 * create/rename/archive (which changes `merchantCategories` / `categoryName`) —
 * must reindex those products. Non-fatal — a search failure must never break the
 * originating write. Must be called AFTER the owning transaction commits.
 */
async function reindexProductsForMerchant(
  merchantId: string | number,
): Promise<void> {
  try {
    const products = await prisma.product.findMany({
      where: { location: { merchantId: Number(merchantId) } },
      select: { id: true },
    });

    await Promise.all(products.map((p) => reindexForSearch(p.id)));
  } catch (e) {
    console.warn(
      `[typesense] reindex products for merchant ${merchantId} failed: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
}

async function getProductById(
  id: string | number,
  {
    withCategory,
    withLocation,
  }: { withCategory?: boolean; withLocation?: boolean } = {},
  tx?: Prisma.TransactionClient
): Promise<Product> {
  const db = tx ?? prisma;

  try {
    const product = await db.product.findUnique({
      where: { id: Number(id) },
      include: {
        category: withCategory,
        location: withLocation,
      },
    });
    if (!product) throw NotFoundError.Product;

    return product;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchProduct(`id: ${id}`);
  }
}

async function updateProduct(
  id: string | number,
  dto: UpdateProductDTO,
  tx?: Prisma.TransactionClient
): Promise<Product> {
  const db = tx ?? prisma;
  try {
    const existing = await getProductById(id, {}, tx);

    const product = await db.product.update({
      where: { id: Number(id) },
      data: {
        ...dto,
        productType: (dto.productType as PRODUCT_TYPE) ?? existing.productType,
      },
    });

    return product;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateProduct;
  }
}

async function updateStripePriceId(
  id: string | number,
  stripePriceId: string,
  tx?: Prisma.TransactionClient,
): Promise<Product> {
  const db = tx ?? prisma;
  try {
    return await db.product.update({
      where: { id: Number(id) },
      data: { stripePriceId },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateProduct;
  }
}

export const ProductServiceInternal: IProductServiceInternal = {
  getProductById,
  findProductById,
  findProductByIdExtended,
  reindexForSearch,
  reindexProductsForLocation,
  reindexProductsForMerchant,
  createProduct,
  updateProduct,
  updateStripePriceId,
};
