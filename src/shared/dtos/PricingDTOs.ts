import {
  DROP_IN_PRICING_UNIT,
  PRICE_TYPE,
  Pricing,
  Product,
  RESIDENCY_TYPE,
} from "@prisma/client";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import NumberUtils from "../../utils/numberUtils";
import z from "zod";
import { Helper } from "../../utils/helper";

export const CreatePricingSchema = z
  .object({
    name: z.string().min(1),
    price: z.number().nonnegative(),
    priceType: Helper.prismaToZodEnum(PRICE_TYPE),
    dropInUnit: Helper.prismaToZodEnum(DROP_IN_PRICING_UNIT).optional(),
    sessionsIncluded: z.number().int().positive().optional(),
    validityDays: z.number().int().positive().optional(),
    canShareSiblings: z.boolean().optional(),
    residencyType: Helper.prismaToZodEnum(RESIDENCY_TYPE),
    ageMin: z.number().int().optional(),
    ageMax: z.number().int().optional(),
    isPublic: z.boolean().optional(),
    promoPrice: z.number().nonnegative().optional(),
    promoCode: z.string().optional(),
    promoStartDate: z.coerce.date().optional(),
    promoEndDate: z.coerce.date().optional(),
    earlyBirdDiscount: z.number().nonnegative().optional(),
    earlyBirdDeadline: z.coerce.date().optional(),
    siblingsDiscount: z.number().nonnegative().optional(),
    displayOrder: z.number().int().optional(),
    isRecommended: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.ageMin && val.ageMax && val.ageMin > val.ageMax) {
      ctx.addIssue({
        code: "custom",
        path: ["ageMax"],
        message: "ageMax must be greater than or equal to ageMin",
      });
    }
  });

export type CreatePricingDTO = z.infer<typeof CreatePricingSchema>;

export const UpdatePricingSchema = CreatePricingSchema.partial();

export type UpdatePricingDTO = z.infer<typeof UpdatePricingSchema>;

export type PricingResponseDTO = {
  id: number;
  pricingID: string;
  productId: number;
  product?: ProductResponseDTO;
  name: string;
  price: number;
  priceType: PRICE_TYPE;
  dropInUnit: DROP_IN_PRICING_UNIT | null;
  sessionsIncluded: number | null;
  validityDays: number | null;
  canShareSiblings: boolean;
  residencyType: RESIDENCY_TYPE | null;
  ageMin: number | null;
  ageMax: number | null;
  isPublic: boolean;
  promoPrice: number | null;
  promoCode: string | null;
  promoStartDate: Date | null;
  promoEndDate: Date | null;
  earlyBirdDiscount: number | null;
  earlyBirdDeadline: Date | null;
  siblingDiscount: number | null;
  displayOrder: number | null;
  isRecommended: boolean;
  createdAt: Date;
};

export function mapPricingResponseDTO(
  pricing: Pricing,
  { product }: { product?: Product } = {},
): PricingResponseDTO {
  const mapped: PricingResponseDTO = {
    id: pricing.id,
    pricingID: pricing.pricingID,
    productId: pricing.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    name: pricing.name,
    price: NumberUtils.decimalToNumber(pricing.price),
    priceType: pricing.priceType,
    dropInUnit: pricing.dropInUnit,
    sessionsIncluded: pricing.sessionsIncluded,
    validityDays: pricing.validityDays,
    canShareSiblings: pricing.canShareSiblings,
    residencyType: pricing.residencyType,
    ageMin: pricing.ageMin,
    ageMax: pricing.ageMax,
    isPublic: pricing.isPublic,
    promoPrice: NumberUtils.decimalToNumber(pricing.promoPrice),
    promoCode: pricing.promoCode,
    promoStartDate: pricing.promoStartDate,
    promoEndDate: pricing.promoEndDate,
    earlyBirdDiscount: NumberUtils.decimalToNumber(pricing.earlyBirdDiscount),
    earlyBirdDeadline: pricing.earlyBirdDeadline,
    siblingDiscount: NumberUtils.decimalToNumber(pricing.siblingsDiscount),
    displayOrder: pricing.displayOrder,
    isRecommended: pricing.isRecommended,
    createdAt: pricing.createdAt,
  };

  return mapped;
}
