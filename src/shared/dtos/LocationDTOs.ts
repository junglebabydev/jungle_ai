import {
  Location,
  LOCATION_TYPE,
  LocationDetails,
  LocationMedia,
  LocationOperatingHrs,
  Merchant,
  MimeType,
  SG_REGIONS,
} from "@prisma/client";
import { mapMerchantResponseDTO, MerchantResonseDTO } from "./MerchantDTOs";
import { z } from "zod";
import { Helper } from "../../utils/helper";
import { stripSignedParams } from "../../utils/storageUrl";
import NumberUtils from "../../utils/numberUtils";
import {
  LocationDetailsResponseDTO,
  mapLocationDetailsResponseDTO,
} from "./LocationDetailsDTOs";
import {
  LocationOperatingHrsResponseDTO,
  mapLocationOperatingHrsResponseDTO,
} from "./LocationOperatingHrsDTOs";
import {
  LocationMediaResponseDTO,
  mapLocationMediaResponseDTO,
} from "./LocationMediaDTOs";

// merchantId is intentionally NOT part of the create body. It is path-derived
// from req.params.merchantId (the merchant the caller is authorized against in
// requireMerchantOwner) and assembled into CreateLocationDTO by the router.
// This stops a body merchantId from overriding the authorized tenant (IDOR).
export const CreateLocationBodySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  sgDistrict: z.string().min(1),
  sgRegion: Helper.prismaToZodEnum(SG_REGIONS),
  locationType: Helper.prismaToZodEnum(LOCATION_TYPE),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
  phone: z.string().optional(),
  email: z.email().optional(),
  whatsApp: z.string().optional(),
  ageMin: z.number().int().optional(),
  ageMax: z.number().int().optional(),
  thumbnail: z.url().transform(stripSignedParams).optional(),
  gMapUrl: z.url(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  details: z
    .object({
      description: z.string().optional(),
      termsSummary: z.string().optional(),
      termsUrl: z.string().optional(),
      bookingUrl: z.string().optional(),
      webUrl: z.string().optional(),
      email: z.string().optional(),
      instagramUrl: z.string().optional(),
      facebookUrl: z.string().optional(),
      phone: z.string().optional(),
      whatsApp: z.string().optional(),
      // The questions a parent asks a venue before booking. Free text, because a
      // merchant's real answer ("carpark B, $2/hr, free after 6") is never a flag.
      parking: z.string().optional(),
      whatToBring: z.string().optional(),
      supervisionPolicy: z.string().optional(),
      amenities: z.string().optional(),
    })
    .optional(),
  operatingHrs: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        businessHrs: z.string().optional(),
      }),
    )
    .optional(),
  media: z
    .array(
      z.object({
        url: z.url(),
        mimeType: Helper.prismaToZodEnum(MimeType),
        sequence: z.number().int().optional(),
      }),
    )
    .optional(),
});

export type CreateLocationBodyDTO = z.infer<typeof CreateLocationBodySchema>;

// Full create DTO = validated body + the path-derived merchantId (assembled in
// the router handler from req.params.merchantId).
export type CreateLocationDTO = CreateLocationBodyDTO & {
  merchantId: number;
};

// Update derives from the body schema, so it has no merchantId either — a
// location cannot be reassigned to another merchant via update.
export const UpdateLocationSchema = CreateLocationBodySchema.partial();

export type UpdateLocationDTO = z.infer<typeof UpdateLocationSchema>;

export type LocationResponseDTO = {
  id: number;
  locationID: string;
  merchantId: number;
  merchant?: MerchantResonseDTO;
  name: string;
  address: string;
  sgDistrict: string;
  sgRegion: SG_REGIONS;
  postalCode?: string | null;
  lat?: number | null;
  long?: number | null;
  phone?: string | null;
  email?: string | null;
  whatsApp?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  thumbnail?: string | null;
  locationType: LOCATION_TYPE;
  gMapUrl: string;
  gMapRating?: number | null;
  reviewCount?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  details?: LocationDetailsResponseDTO | null;
  operatingHrs?: LocationOperatingHrsResponseDTO[];
  media?: LocationMediaResponseDTO[];
};

export function mapLocationResponseDTO(
  location: Location,
  {
    merchant,
    details,
    operatingHrs,
    media,
  }: {
    merchant?: Merchant;
    details?: LocationDetails | null;
    operatingHrs?: LocationOperatingHrs[];
    media?: LocationMedia[];
  } = {},
): LocationResponseDTO {
  const mapped: LocationResponseDTO = {
    id: location.id,
    locationID: location.locationID,
    merchantId: location.merchantId,
    merchant: merchant ? mapMerchantResponseDTO(merchant, {}) : undefined,
    name: location.name,
    address: location.address,
    sgDistrict: location.sgDistrict,
    sgRegion: location.sgRegion,
    postalCode: location.postalCode,
    lat: location.lat,
    long: location.long,
    phone: location.phone,
    email: location.email,
    whatsApp: location.whatsApp,
    ageMin: location.ageMin,
    ageMax: location.ageMax,
    thumbnail: location.thumbnail,
    locationType: location.locationType,
    gMapUrl: location.gMapUrl,
    gMapRating: location.gMapRating && NumberUtils.decimalToNumber(location.gMapRating),
    reviewCount: location.reviewCount,
    isActive: location.isActive,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,

    details: details ? mapLocationDetailsResponseDTO(details) : undefined,
    operatingHrs: operatingHrs
      ? operatingHrs.map((hrs) => mapLocationOperatingHrsResponseDTO(hrs))
      : undefined,
    media: media ? media.map((m) => mapLocationMediaResponseDTO(m)) : undefined,
  } as const;

  return mapped;
}
