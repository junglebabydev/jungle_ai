import {
  BIRTHDAY_VENUE_TYPE,
  BirthdayAddon,
  BirthdayDetails,
  Product,
  PRODUCT_TYPE,
  ProductCategory,
  SG_REGIONS,
} from "@prisma/client";
import {
  CreateProductBaseSchema,
  mapProductResponseDTO,
  ProductOrderByKey,
  ProductResponseDTO,
  UpdateProductSchema,
} from "./ProductDTOs";
import z from "zod";
import { Helper } from "../../utils/helper";
import {
  mapProductCategoryResponseDTO,
  ProductCategoryResonseDTO,
} from "./ProductCategoryDTOs";
import {
  BirthdayAddonResponseDTO,
  mapBirthdayAddonResponseDTO,
} from "./BirthdayAddonDTOs";
import { PaginatedRequestDTO } from "./PaginationDTO";
import { ProductExtended } from "../types/product";

export const CreateBirthdayDetailsSchema = z.object({
  venueType: Helper.prismaToZodEnum(BIRTHDAY_VENUE_TYPE),
  durationMinutes: z.number().positive().optional(),
  minKids: z.int().positive().optional(),
  maxKids: z.int().positive().optional(),
  minParents: z.int().positive().optional(),
  maxParents: z.int().positive().optional(),
  whatsIncluded: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  // Nullable, not defaulted: null means the merchant has not said. `ClassDetails`
  // asks the same question as a defaulted boolean; these cannot, because their rows
  // already exist and a default would answer for every one of them.
  requiresPackage: z.boolean().nullable().optional(),
});

export type CreateBirthdayDetailsDTO = z.infer<
  typeof CreateBirthdayDetailsSchema
>;

export const CreateBirthdayProductSchema = CreateProductBaseSchema.safeExtend({
  productType: z.literal(PRODUCT_TYPE.BIRTHDAY),
});

export type CreateBirthdayProductDTO = z.infer<
  typeof CreateBirthdayProductSchema
>;

export const CreateBirthdaySchema = z.object({
  product: CreateBirthdayProductSchema,
  birthdayDetails: CreateBirthdayDetailsSchema,
});

export type CreateBirthdayDTO = z.infer<typeof CreateBirthdaySchema>;

export const UpdateBirthdayDetailsSchema =
  CreateBirthdayDetailsSchema.partial();

export type UpdateBirthdayDetailsDTO = z.infer<
  typeof UpdateBirthdayDetailsSchema
>;

export const UpdateBirthdaySchema = z.object({
  product: UpdateProductSchema.optional(),
  birthdayDetails: UpdateBirthdayDetailsSchema.optional(),
});

export type UpdateBirthdayDTO = z.infer<typeof UpdateBirthdaySchema>;

export const BirthdayDetailsFilterQuerySchema = z.object({
  categoryId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
});

export const BirthdayDetailsFilterBodySchema = z.object({
  region: Helper.prismaToZodEnum(SG_REGIONS).optional(),
  tags: z.array(z.string()).optional(),
  age: z.number().int().positive().optional(),
  locationType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  durationMinutes: z.number().positive().optional(),
  kidsCount: z.number().int().positive().optional(),
  parentsCount: z.number().int().positive().optional(),
  venueType: Helper.prismaToZodEnum(BIRTHDAY_VENUE_TYPE).optional(),
  search: z.string().optional(),
});

export type BirthdayDetailsFilterQuery = z.infer<
  typeof BirthdayDetailsFilterQuerySchema
> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type BirthdayDetailsFilterBody = z.infer<
  typeof BirthdayDetailsFilterBodySchema
>;

export type BirthdayDetailsFilter = BirthdayDetailsFilterQuery &
  BirthdayDetailsFilterBody;

export type BirthdayDetailsResponseDTO = {
  id: number;
  birthdayID: string;

  productId: number;
  product?: ProductResponseDTO;

  categoryId?: number | null;
  category?: ProductCategoryResonseDTO | null;

  venueType: BIRTHDAY_VENUE_TYPE;
  durationMinutes: number | null;

  minKids: number | null;
  maxKids: number | null;
  minParents: number | null;
  maxParents: number | null;

  whatsIncluded: string | null;
  cancellationPolicy: string | null;
  // Whether a package must be bought to book. Null means unanswered — say "not
  // listed" rather than treating it as a no.
  requiresPackage: boolean | null;

  createdAt: Date;

  addons?: BirthdayAddonResponseDTO[];
};

export function mapBirthdayDetailsResponseDTO(
  birthdayDetails: BirthdayDetails,
  {
    product,
    category,
    addons,
  }: {
    product?: Product | ProductExtended;
    category?: ProductCategory | null;
    addons?: BirthdayAddon[];
  } = {},
): BirthdayDetailsResponseDTO {
  const mapped: BirthdayDetailsResponseDTO = {
    id: birthdayDetails.id,
    birthdayID: birthdayDetails.birthdayID,
    productId: birthdayDetails.productId,
    product: product
      ? Helper.isProductExtended(product)
        ? mapProductResponseDTO(product, {
            location: product.location,
            merchant: product.location?.merchant,
          })
        : mapProductResponseDTO(product)
      : undefined,
    categoryId: birthdayDetails.categoryId,
    category: category ? mapProductCategoryResponseDTO(category) : undefined,
    venueType: birthdayDetails.venueType,
    durationMinutes: birthdayDetails.durationMinutes,
    minKids: birthdayDetails.minKids,
    maxKids: birthdayDetails.maxKids,
    minParents: birthdayDetails.minParents,
    maxParents: birthdayDetails.maxParents,
    whatsIncluded: birthdayDetails.whatsIncluded,
    cancellationPolicy: birthdayDetails.cancellationPolicy,
    requiresPackage: birthdayDetails.requiresPackage,
    createdAt: birthdayDetails.createdAt,
    addons: addons
      ? addons.map((addon) => mapBirthdayAddonResponseDTO(addon))
      : [],
  };

  return mapped;
}
