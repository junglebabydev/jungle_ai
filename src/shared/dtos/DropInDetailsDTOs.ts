import z from "zod";
import {
  CreateProductBaseSchema,
  mapProductResponseDTO,
  ProductOrderByKey,
  ProductResponseDTO,
  UpdateProductSchema,
} from "./ProductDTOs";
import {
  DropInDetails,
  DropInSchedule,
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
  DropInScheduleResponseDTO,
  mapDropInScheduleResponseDTO,
} from "./DropInScheduleDTOs";
import { ProductExtended } from "../types/product";

export const CreateDropInDetailsSchema = z.object({
  minKids: z.number().int().optional(),
  maxKids: z.number().int().optional(),
  minParents: z.number().int().optional(),
  maxParents: z.number().int().optional(),
  whatsIncluded: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  // Nullable, not defaulted: null means the merchant has not said. `ClassDetails`
  // asks the same question as a defaulted boolean; these cannot, because their rows
  // already exist and a default would answer for every one of them.
  requiresPackage: z.boolean().nullable().optional(),
  notes: z.string().optional(),
  bookingUrl: z.string().optional(),
});

export type CreateDropInDetailsDTO = z.infer<typeof CreateDropInDetailsSchema>;

export const CreateDropInProductSchema = CreateProductBaseSchema.safeExtend({
  productType: z.literal(PRODUCT_TYPE.DROP_IN),
});

export type CreateDropInProductDTO = z.infer<typeof CreateDropInProductSchema>;

export const CreateDropInSchema = z.object({
  product: CreateDropInProductSchema,
  dropInDetails: CreateDropInDetailsSchema,
});

export type CreateDropInDTO = z.infer<typeof CreateDropInSchema>;

export const UpdateDropInDetailsSchema = CreateDropInDetailsSchema.partial();

export type UpdateDropInDetailsDTO = z.infer<typeof UpdateDropInDetailsSchema>;

export const UpdateDropInSchema = z.object({
  product: UpdateProductSchema.optional(),
  dropInDetails: UpdateDropInDetailsSchema.optional(),
});

export type UpdateDropInDTO = z.infer<typeof UpdateDropInSchema>;

export const DropInDetailsFilterQuerySchema = z.object({
  categoryId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
});

export const DropInDetailsFilterBodySchema = z.object({
  region: Helper.prismaToZodEnum(SG_REGIONS).optional(),
  tags: z.array(z.string()).optional(),
  age: z.number().int().positive().optional(),
  locationType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  search: z.string().optional(),
});

export type DropInDetailsFilterQuery = z.infer<
  typeof DropInDetailsFilterQuerySchema
> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type DropInDetailsFilterBody = z.infer<
  typeof DropInDetailsFilterBodySchema
>;

export type DropInDetailsFilter = DropInDetailsFilterQuery &
  DropInDetailsFilterBody;

export type DropInDetailsResponseDTO = {
  id: number;
  dropInID: string;
  productId: number;
  product?: ProductResponseDTO;
  categoryId?: number | null;
  category?: ProductCategoryResonseDTO | null;
  minKids: number | null;
  maxKids: number | null;
  minParents: number | null;
  maxParents: number | null;
  whatsIncluded: string | null;
  cancellationPolicy: string | null;
  // Whether a package must be bought to book. Null means unanswered — say "not
  // listed" rather than treating it as a no.
  requiresPackage: boolean | null;
  notes: string | null;
  bookingUrl: string | null;
  createdAt: Date;

  schedules?: DropInScheduleResponseDTO[];
};

export function mapDropInDetailsResponseDTO(
  dropIn: DropInDetails,
  {
    product,
    category,
    schedules,
  }: {
    product?: Product | ProductExtended;
    category?: ProductCategory | null;
    schedules?: DropInSchedule[];
  } = {},
) {
  const mapped: DropInDetailsResponseDTO = {
    id: dropIn.id,
    dropInID: dropIn.dropInID,
    productId: dropIn.productId,
    product: product
      ? Helper.isProductExtended(product)
        ? mapProductResponseDTO(product, {
            location: product.location,
            merchant: product.location?.merchant,
          })
        : mapProductResponseDTO(product)
      : undefined,
    categoryId: dropIn.categoryId,
    category: category ? mapProductCategoryResponseDTO(category) : undefined,
    minKids: dropIn.minKids,
    maxKids: dropIn.maxKids,
    minParents: dropIn.minParents,
    maxParents: dropIn.maxParents,
    whatsIncluded: dropIn.whatsIncluded,
    cancellationPolicy: dropIn.cancellationPolicy,
    requiresPackage: dropIn.requiresPackage,
    notes: dropIn.notes,
    bookingUrl: dropIn.bookingUrl,
    createdAt: dropIn.createdAt,

    schedules: schedules
      ? schedules.map((schedule) => mapDropInScheduleResponseDTO(schedule))
      : [],
  };

  return mapped;
}
