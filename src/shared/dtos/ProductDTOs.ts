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
    // Nullable, not defaulted: null means the merchant has not said, false means
    // they said it is not needed. A default would turn an unanswered question into
    // a definite answer, which is then shown to a parent as one.
    bookingRequired: z.boolean().nullable().optional(),
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
  // Whether a parent must book ahead. Null means unanswered.
  bookingRequired: boolean | null;

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
  // The lowest price a parent can actually pay — public, still valid, never a trial
  // rate. Computed by `search_engine`, which is also what its budget filter and
  // cheapest-first sort use, so a figure shown here agrees with how results were
  // ranked. ABSENT when the product has no usable price, which is NOT the same as
  // free: the concierge must say "not listed" rather than invent a number or imply zero.
  priceFrom?: number;
  /** The top of the same set, and whether the two differ — so a figure can be given
   *  as "from $X" rather than implying one price for a product that has several. */
  priceTo?: number;
  priceIsRange?: boolean;
  /** What `priceFrom` COVERS (per session, per week, per child). A figure without
   *  its unit is worse than no figure. Absent when the cheapest row does not say. */
  priceType?: string;
  /** Exactly zero. Kept separate from an absent price because "free" and "not
   *  listed" are different answers and must never be shown as the same one. */
  isFree?: boolean;
  /** The cheapest row is restricted — residency, an age band, or siblings booking
   *  together — so most parents cannot get it. Disclose rather than quote flat. */
  priceQualified?: boolean;
  /** A minimum group size applies, so a per-child figure is not the total. */
  hasMinimumSpend?: boolean;
  /** Kilometres from the point the search ranked around — the CENTRE of the area the
   *  parent named, NEVER their own position, which nothing here ever knows. Present
   *  only when a distance sort actually ran, so its absence means proximity was
   *  never measured and must not be claimed. */
  distanceKm?: number;
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
    bookingRequired: product.bookingRequired,
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
