import {
  Location,
  LocationDetails,
  LocationOperatingHrs,
  Merchant,
  Product,
  PRODUCT_TYPE,
  ProductCategory,
} from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import {
  mapProductCategoryResponseDTO,
  ProductCategoryResonseDTO,
} from "./ProductCategoryDTOs";
import z from "zod";
import { Helper } from "../../utils/helper";
import { stripSignedParams } from "../../utils/storageUrl";
import { PaginatedRequestDTO } from "./PaginationDTO";
import { mapMerchantResponseDTO, MerchantResonseDTO } from "./MerchantDTOs";
// type-only import — avoids a runtime circular dependency (CampOptionDTOs imports
// mapProductResponseDTO from here). The actual camp-option MAPPING happens in the
// caller (e.g. the search service); this mapper just passes the result through.
import type { CampOptionResponseDTO } from "./CampOptionDTOs";

export const CreateProductBaseSchema = z
  .object({
    categoryId: z.number().positive().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    ageMin: z.number().nonnegative(),
    ageMax: z.number().nonnegative(),
    imageUrl: z.string().transform(stripSignedParams).optional(),
    thumbnailUrl: z.string().transform(stripSignedParams).optional(),
    tags: z.array(z.string()).optional().default([]),
    highlights: z.array(z.string()).optional().default([]),
    isPublished: z.boolean().optional().default(false),
    isArchived: z.boolean().optional().default(false),
    slug: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.ageMin > val.ageMax) {
      ctx.addIssue({
        code: "custom",
        path: ["ageMax"],
        message: "ageMax must be greater than or equal to ageMin",
      });
    }
  });

export const CreateProductSchema = CreateProductBaseSchema.safeExtend({
  productType: Helper.prismaToZodEnum(PRODUCT_TYPE),
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();

export type UpdateProductDTO = z.infer<typeof UpdateProductSchema>;

export const ProductFilterSchema = z.object({
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
  productType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  // When true, also return archived (removed) products — used to find/restore one.
  // Defaults to false, so existing callers keep hiding archived rows.
  includeArchived: z.boolean().optional(),
});

export const PRODUCT_ORDER_BY_KEYS = ["ageMin", "ageMax", "createdAt"] as const;
export type ProductOrderByKey = (typeof PRODUCT_ORDER_BY_KEYS)[number];

export type ProductFilter = z.infer<typeof ProductFilterSchema> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type ProductResponseDTO = {
  id: number;
  productID: string;

  locationId: number;

  categoryId: number | null;

  name: string;
  description: string;
  productType: PRODUCT_TYPE;
  ageMin: number;
  ageMax: number;

  imageUrl: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  highlights: string[];

  isPublished: boolean;
  publishedAt: Date | null;
  isArchived: boolean;
  archivedAt: Date | null;

  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;

  createdAt: Date;
  updatedAt: Date;

  category?: ProductCategoryResonseDTO | null;
  location?: LocationResponseDTO | null;
  merchant?: MerchantResonseDTO | null;
  // A CAMP's bookable weeks/slots (dates, times, price). Present only on CAMP
  // products when the caller hydrates them (e.g. concierge search results);
  // omitted otherwise.
  campOptions?: CampOptionResponseDTO[];
};

export function mapProductResponseDTO(
  product: Product,
  {
    category,
    location,
    merchant,
    locationDetails,
    locationOperatingHrs,
    campOptions,
  }: {
    location?: Location;
    category?: ProductCategory | null;
    merchant?: Merchant | null;
    locationDetails?: LocationDetails | null;
    locationOperatingHrs?: LocationOperatingHrs[];
    // Already-MAPPED camp options (mapped by the caller to avoid a circular import).
    campOptions?: CampOptionResponseDTO[];
  } = {},
): ProductResponseDTO {
  const mapped: ProductResponseDTO = {
    id: product.id,
    productID: product.productID,
    locationId: product.locationId,
    // The merchant lives ONLY at the top level (`product.merchant`) to avoid
    // duplicating the whole object inside the location too; the location still
    // carries `merchantId` to link. Location details + operating hours are
    // forwarded into the location when provided.
    location: location
      ? mapLocationResponseDTO(location, {
          details: locationDetails,
          operatingHrs: locationOperatingHrs,
        })
      : null,
    merchant: merchant ? mapMerchantResponseDTO(merchant) : null,
    categoryId: product.categoryId,
    category: category ? mapProductCategoryResponseDTO(category) : null,
    name: product.name,
    description: product.description,
    productType: product.productType,
    ageMin: product.ageMin,
    ageMax: product.ageMax,
    imageUrl: product.imageUrl,
    thumbnailUrl: product.thumbnailUrl,
    tags: product.tags,
    highlights: product.highlights,
    isPublished: product.isPublished,
    publishedAt: product.publishedAt,
    isArchived: product.isArchived,
    archivedAt: product.archivedAt,
    slug: product.slug,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    ...(campOptions ? { campOptions } : {}),
  };

  return mapped;
}
