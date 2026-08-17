import z from "zod";
import {
  CreateProductBaseSchema,
  mapProductResponseDTO,
  ProductOrderByKey,
  ProductResponseDTO,
  UpdateProductSchema,
} from "./ProductDTOs";
import {
  CampDetails,
  CampOption,
  Product,
  PRODUCT_TYPE,
  ProductCategory,
  SG_REGIONS,
} from "@prisma/client";
import {
  mapProductCategoryResponseDTO,
  ProductCategoryResonseDTO,
} from "./ProductCategoryDTOs";
import { PaginatedRequestDTO } from "./PaginationDTO";
import { Helper } from "../../utils/helper";
import {
  CampOptionResponseDTO,
  mapCampOptionResponseDTO,
} from "./CampOptionDTOs";
import { ProductExtended } from "../types/product";

export const CreateCampDetailsSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  venueAddress: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
  nearestMrt: z.string().optional(),
  // Nullable, not defaulted: null means the merchant has not said. `ClassDetails`
  // asks the same question as a defaulted boolean; these cannot, because their rows
  // already exist and a default would answer for every one of them.
  requiresPackage: z.boolean().nullable().optional(),
  nearestBusStop: z.string().optional(),
  mealIncluded: z.boolean().optional().default(false),
  busIncluded: z.boolean().optional().default(false),
  discountDetails: z.string().optional(),
  bookingUrl: z.string().optional(),
  notes: z.string().optional(),
  cancellationPolicy: z.string().optional(),
});

export type CreateCampDetailsDTO = z.infer<typeof CreateCampDetailsSchema>;

export const CreateCampProductSchema = CreateProductBaseSchema.safeExtend({
  productType: z.literal(PRODUCT_TYPE.CAMP),
});

export type CreateCampProductDTO = z.infer<typeof CreateCampProductSchema>;

export const CreateCampSchema = z.object({
  product: CreateCampProductSchema,
  campDetails: CreateCampDetailsSchema,
});

export type CreateCampDTO = z.infer<typeof CreateCampSchema>;

export const UpdateCampDetailsSchema = CreateCampDetailsSchema.partial();

export type UpdateCampDetailsDTO = z.infer<typeof UpdateCampDetailsSchema>;

export const UpdateCampSchema = z.object({
  product: UpdateProductSchema.optional(),
  campDetails: UpdateCampDetailsSchema.optional(),
});

export type UpdateCampDTO = z.infer<typeof UpdateCampSchema>;

export const CampDetailsFilterQuerySchema = z.object({
  categoryId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
});

export const CampDetailsFilterBodySchema = z.object({
  region: Helper.prismaToZodEnum(SG_REGIONS).optional(),
  tags: z.array(z.string()).optional(),
  age: z.number().int().positive().optional(),
  locationType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  startDate: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type CampDetailsFilterQuery = z.infer<
  typeof CampDetailsFilterQuerySchema
> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type CampDetailsFilterBody = z.infer<typeof CampDetailsFilterBodySchema>;

export type CampDetailsFilter = CampDetailsFilterQuery & CampDetailsFilterBody;

export type CampDetailsResponseDTO = {
  id: number;
  campID: string;
  productId: number;
  product?: ProductResponseDTO;
  categoryId?: number | null;
  category?: ProductCategoryResonseDTO | null;
  name: string | null;
  description: string | null;
  venueAddress: string | null;
  lat: number | null;
  long: number | null;
  nearestMrt: string | null;
  // Whether a package must be bought to book. Null means unanswered — say "not
  // listed" rather than treating it as a no.
  requiresPackage: boolean | null;
  nearestBusStop: string | null;
  mealIncluded: boolean;
  busIncluded: boolean;
  discountDetails: string | null;
  bookingUrl: string | null;
  notes: string | null;
  // The merchant's stated refund terms, or null when they have not given any.
  cancellationPolicy: string | null;
  createdAt: Date;

  options?: CampOptionResponseDTO[];
};

export function mapCampDetailsResponseDTO(
  campDetails: CampDetails,
  {
    product,
    category,
    campOptions,
  }: {
    product?: Product | ProductExtended;
    category?: ProductCategory | null;
    campOptions?: CampOption[] | null;
  } = {},
): CampDetailsResponseDTO {
  const mapped: CampDetailsResponseDTO = {
    id: campDetails.id,
    campID: campDetails.campID,
    productId: campDetails.productId,
    product: product
      ? Helper.isProductExtended(product)
        ? mapProductResponseDTO(product, {
            location: product.location,
            merchant: product.location?.merchant,
          })
        : mapProductResponseDTO(product)
      : undefined,
    categoryId: campDetails.categoryId,
    category: category ? mapProductCategoryResponseDTO(category) : null,
    name: campDetails.name,
    description: campDetails.description,
    venueAddress: campDetails.venueAddress,
    lat: campDetails.lat,
    long: campDetails.long,
    nearestMrt: campDetails.nearestMrt,
    requiresPackage: campDetails.requiresPackage,
    nearestBusStop: campDetails.nearestBusStop,
    mealIncluded: campDetails.mealIncluded,
    busIncluded: campDetails.busIncluded,
    discountDetails: campDetails.discountDetails,
    bookingUrl: campDetails.bookingUrl,
    notes: campDetails.notes,
    cancellationPolicy: campDetails.cancellationPolicy,
    createdAt: campDetails.createdAt,

    options: campOptions
      ? campOptions.map((option) => mapCampOptionResponseDTO(option))
      : [],
  };

  return mapped;
}
