import {
  Location,
  LocationDetails,
  LocationMedia,
  LocationOperatingHrs,
  LOCATION_TYPE,
  Merchant,
  SG_REGIONS,
} from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { z } from "zod";
import { PaginatedRequestDTO } from "./PaginationDTO";
import { Helper } from "../../utils/helper";
import { stripSignedParams } from "../../utils/storageUrl";

type LocationWithIncludes = Location & {
  details?: LocationDetails | null;
  operatingHrs?: LocationOperatingHrs[];
  media?: LocationMedia[];
};

export const CreateMerchantSchema = z.object({
  name: z.string().min(1),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  webUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().transform(stripSignedParams).optional().or(z.literal("")),
  brandColor: z.string().optional(),
  businessRegistration: z.string().optional(),
  gstNumber: z.string().optional(),
  gstRegistered: z.boolean().optional(),
  isActive: z.boolean().optional().default(true),
  isVerified: z.boolean().optional().default(true),
  isArchived: z.boolean().optional().default(false),
});

export type CreateMerchantDTO = z.infer<typeof CreateMerchantSchema>;

export const UpdateMerchantSchema = z.object({
  name: z.string().min(1).optional(),
  webUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().transform(stripSignedParams).optional().or(z.literal("")),
  brandColor: z.string().optional(),
  businessRegistration: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
  gstRegistered: z.boolean().optional(),
});

export type UpdateMerchantDTO = z.infer<typeof UpdateMerchantSchema>;

export const MERCHANT_ORDER_BY_KEYS = ["createdAt", "name"] as const;
export type MerchantOrderKey = (typeof MERCHANT_ORDER_BY_KEYS)[number];

/**
 * The web client sends each filter as a Prisma-style wrapper
 * (`{ equals }` / `{ in }` / `{ has }` / `{ hasSome }`), and sends empty
 * wrappers (`{ equals: "" }`, `{ in: [] }`) for unselected filters. Reduce any
 * such value to a plain scalar/array, treating empty string / empty array as
 * "no value". A truthy `{ equals: "" }` object reaching the search engine is
 * exactly what produced the `[object Object]` Typesense filter that zeroed out
 * results — collapse it to `undefined` here instead.
 */
const unwrapFilterValue = (input: unknown): unknown => {
  if (input == null) return undefined;
  if (typeof input === "string") return input.trim() === "" ? undefined : input;
  if (Array.isArray(input)) return input.length ? input : undefined;
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const inner =
      "equals" in obj
        ? obj.equals
        : "in" in obj
          ? obj.in
          : "has" in obj
            ? obj.has
            : "hasSome" in obj
              ? obj.hasSome
              : undefined;
    return unwrapFilterValue(inner);
  }
  return input;
};

/**
 * A filter field that may arrive raw or wrapped. The value is unwrapped first,
 * then validated; anything that doesn't match (an unknown enum member, a
 * malformed shape) degrades to `undefined` rather than throwing — a bad filter
 * just means "no filter", never a 400. This keeps the public list endpoint as
 * tolerant of arbitrary bodies as it was before structured filters existed.
 */
const filterField = <T extends z.ZodType>(schema: T) =>
  z.preprocess(unwrapFilterValue, schema.optional().catch(undefined));

const regionSchema = z.union([
  Helper.prismaToZodEnum(SG_REGIONS),
  z.array(Helper.prismaToZodEnum(SG_REGIONS)),
]);

// Category is filtered by ID (the web client sends `categoryId`). Accept a
// single id or a list and normalize to an id array; coercion tolerates string
// ids ("12") from the query layer.
const categoryIdSchema = z
  .union([
    z.coerce.number().int().positive(),
    z.array(z.coerce.number().int().positive()),
  ])
  .transform((v) => (Array.isArray(v) ? v : [v]));

// Tags are matched with hasSome semantics; accept a single tag or a list and
// normalize to a non-empty string array.
const tagsSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) =>
    (Array.isArray(v) ? v : [v]).filter((t) => t.trim() !== ""),
  );

export const MerchantFilterBodySchema = z.object({
  search: filterField(z.string()),
  // Structured filters — applied in both the Typesense and DB paths. Each uses
  // filterField so the web client's Prisma-style wrappers ({ equals: true })
  // unwrap to a plain value rather than being silently dropped.
  isVerified: filterField(z.boolean()),
  // The web client sends the region under `sgRegion`; accept both names. The
  // router coalesces them (`region ?? sgRegion`) before calling the service.
  region: filterField(regionSchema),
  sgRegion: filterField(regionSchema),
  locationType: filterField(Helper.prismaToZodEnum(LOCATION_TYPE)),
  // `category` filters by name (legacy); `categoryId` filters by id (what the
  // web client sends, mirroring the camp collection's id-based category filter).
  category: filterField(z.string()),
  categoryId: filterField(categoryIdSchema),
  tags: filterField(tagsSchema),
});

export type MerchantFilterBody = z.infer<typeof MerchantFilterBodySchema>;

export type MerchantFilter = PaginatedRequestDTO<MerchantOrderKey> &
  MerchantFilterBody;

export type MerchantResonseDTO = {
  id: number;
  merchantID: string;
  name: string;
  businessRegistration?: string | null;
  gstRegistered: boolean;
  gstNumber?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  webUrl?: string | null;
  isVerified: boolean;
  verifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  locations?: LocationResponseDTO[];
};

export function mapMerchantResponseDTO(
  merchant: Merchant,
  { locations }: { locations?: LocationWithIncludes[] } = {},
): MerchantResonseDTO {
  const mapped: MerchantResonseDTO = {
    id: merchant.id,
    merchantID: merchant.merchantID,
    name: merchant.name,
    businessRegistration: merchant.businessRegistration,
    gstRegistered: merchant.gstRegistered,
    gstNumber: merchant.gstNumber,
    logoUrl: merchant.logoUrl,
    brandColor: merchant.brandColor,
    contactEmail: merchant.contactEmail,
    contactPhone: merchant.contactPhone,
    webUrl: merchant.webUrl,
    isVerified: merchant.isVerified,
    verifiedAt: merchant.verifiedAt,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
    locations: locations
      ? locations.map((location) =>
          mapLocationResponseDTO(location, {
            details: location.details,
            operatingHrs: location.operatingHrs,
            media: location.media,
          }),
        )
      : [],
  };

  return mapped;
}
