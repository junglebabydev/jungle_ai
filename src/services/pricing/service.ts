import {
  DROP_IN_PRICING_UNIT,
  PRICE_TYPE,
  Prisma,
  PRODUCT_TYPE,
  RESIDENCY_TYPE,
} from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreatePricingDTO,
  mapPricingResponseDTO,
  PricingResponseDTO,
  UpdatePricingDTO,
} from "../../shared/dtos/PricingDTOs";
import { IPricingService } from "./service.interface";
import { AuthError } from "../../errors/domains/AuthError";
import { ServiceLocator } from "..";

async function createPricing(
  productId: string | number,
  dto: CreatePricingDTO,
  tx?: Prisma.TransactionClient,
): Promise<PricingResponseDTO> {
  const db = tx ?? prisma;
  const { isArchived } = dto;

  // Validate unit for DROP_IN product type
  const product = await ServiceLocator.ProductService.internal.getProductById(
    productId,
    {},
  );

  if (product.productType === PRODUCT_TYPE.DROP_IN) {
    if (!dto.dropInUnit) throw BadRequestError.CreatePricing(["Please provide a valid drop in unit for this product"]);
  }

  try {
    const pricing = await db.pricing.create({
      data: {
        productId: Number(productId),
        name: dto.name,
        price: dto.price,
        priceType: dto.priceType as PRICE_TYPE,
        dropInUnit:
          product.productType === PRODUCT_TYPE.DROP_IN
            ? (dto.dropInUnit as DROP_IN_PRICING_UNIT)
            : null,
        sessionsIncluded: dto.sessionsIncluded,
        validityDays: dto.validityDays,
        canShareSiblings: dto.canShareSiblings,
        residencyType: dto.residencyType as RESIDENCY_TYPE,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        isPublic: dto.isPublic,
        promoPrice: dto.promoPrice,
        promoCode: dto.promoCode,
        promoStartDate: dto.promoStartDate,
        promoEndDate: dto.promoEndDate,
        earlyBirdDiscount: dto.earlyBirdDiscount,
        earlyBirdDeadline: dto.earlyBirdDeadline,
        siblingsDiscount: dto.siblingsDiscount,
        displayOrder: dto.displayOrder,
        isRecommended: dto.isRecommended,
        isArchived,
        archivedAt: isArchived ? new Date() : undefined,
      },
    });

    // `priceFrom` (min public price) is denormalized into the product's search
    // doc, so a new price must reindex the parent product. Only for a standalone
    // write — a nested write (tx passed) is reindexed post-commit by its caller
    // (the product write). Fire-and-forget; the periodic reconcile is the backstop.
    if (!tx) {
      void ServiceLocator.ProductService.internal.reindexForSearch(
        Number(productId),
      );
    }

    return mapPricingResponseDTO(pricing);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreatePricing();
  }
}

async function updatePricing(
  pricingId: number,
  dto: UpdatePricingDTO,
  { productId, locationId }: { productId: number; locationId: number },
): Promise<PricingResponseDTO> {
  const { isArchived } = dto;

  try {
    const existing = await prisma.pricing.findFirst({
      where: {
        id: pricingId,
        productId,
        product: {
          locationId,
        },
      },
    });

    if (!existing) throw AuthError.Forbidden;

    const updated = await prisma.pricing.update({
      where: { id: pricingId },
      data: {
        name: dto.name ?? existing.name,
        price: dto.price ?? existing.price,
        priceType: (dto.priceType as PRICE_TYPE) ?? existing.priceType,
        dropInUnit:
          (dto.dropInUnit as DROP_IN_PRICING_UNIT) ?? existing.dropInUnit,
        sessionsIncluded: dto.sessionsIncluded ?? existing.sessionsIncluded,
        validityDays: dto.validityDays ?? existing.validityDays,
        canShareSiblings: dto.canShareSiblings ?? existing.canShareSiblings,
        residencyType:
          (dto.residencyType as RESIDENCY_TYPE) ?? existing.residencyType,
        ageMin: dto.ageMin ?? existing.ageMin,
        ageMax: dto.ageMax ?? existing.ageMax,
        isPublic: dto.isPublic ?? existing.isPublic,
        promoPrice: dto.promoPrice ?? existing.promoPrice,
        promoCode: dto.promoCode ?? existing.promoCode,
        promoStartDate: dto.promoStartDate ?? existing.promoStartDate,
        promoEndDate: dto.promoEndDate ?? existing.promoEndDate,
        earlyBirdDiscount: dto.earlyBirdDiscount ?? existing.earlyBirdDiscount,
        earlyBirdDeadline: dto.earlyBirdDeadline ?? existing.earlyBirdDeadline,
        siblingsDiscount: dto.siblingsDiscount ?? existing.siblingsDiscount,
        displayOrder: dto.displayOrder ?? existing.displayOrder,
        isRecommended: dto.isRecommended ?? existing.isRecommended,
        isArchived: dto.isArchived ?? existing.isArchived,
        archivedAt: isArchived ? new Date() : undefined,
      },
    });

    // A price change shifts the product's denormalized `priceFrom` in the search
    // index, so reindex the parent product. Fire-and-forget; reconcile backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(productId);

    return mapPricingResponseDTO(updated);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdatePricing;
  }
}

async function getPricingById(
  id: string | number,
  { withProduct }: { withProduct?: boolean } = {},
): Promise<PricingResponseDTO> {
  try {
    const pricing = await prisma.pricing.findUnique({
      where: { id: Number(id) },
      include: {
        product: withProduct,
      },
    });
    if (!pricing) throw NotFoundError.Pricing;

    return mapPricingResponseDTO(pricing, { product: pricing.product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPricing(`id: ${id}`);
  }
}

async function listPricingByProduct(
  productId: string | number,
  {
    withProduct,
    onlyPublic,
  }: { withProduct?: boolean; onlyPublic?: boolean } = {},
): Promise<PricingResponseDTO[]> {
  const isPublic = onlyPublic === true ? true : undefined;
  // "Publicly visible" means public AND not removed: an archived row is a
  // soft-deleted price the public must never see. This mirrors the search
  // index's `priceFrom`, which excludes `isArchived` pricings (see
  // search-index/collections/products.ts). Only the `onlyPublic` path is
  // tightened, so non-public callers (merchant grounding, connect-payment)
  // keep their existing "all rows" behavior.
  const isArchived = onlyPublic === true ? false : undefined;
  try {
    const pricings = await prisma.pricing.findMany({
      where: {
        productId: Number(productId),
        isPublic,
        isArchived,
      },
      include: {
        product: withProduct,
      },
    });

    return pricings.map((pricing) =>
      mapPricingResponseDTO(pricing, { product: pricing.product }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPricing();
  }
}

export const PricingService: IPricingService = {
  createPricing,
  updatePricing,
  getPricingById,
  listPricingByProduct,
};
