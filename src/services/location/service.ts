import prisma from "../../config/prisma";
import { ServiceLocator } from "..";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CreateLocationDTO,
  LocationResponseDTO,
  UpdateLocationDTO,
  mapLocationResponseDTO,
} from "../../shared/dtos/LocationDTOs";
import { ILocationService } from "./service.interface";
import { LOCATION_TYPE, MimeType, SG_REGIONS } from "@prisma/client";
import { Helper } from "../../utils/helper";
import { LocationExtended } from "../../shared/types/location";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function createLocation(
  dto: CreateLocationDTO,
): Promise<LocationResponseDTO> {
  try {
    const location = await prisma.location.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        address: dto.address,
        sgDistrict: dto.sgDistrict,
        sgRegion: Helper.zodToPrismaEnum(SG_REGIONS, dto.sgRegion),
        locationType: Helper.zodToPrismaEnum(LOCATION_TYPE, dto.locationType),
        postalCode: dto.postalCode,
        lat: dto.lat,
        long: dto.long,
        phone: dto.phone,
        email: dto.email,
        whatsApp: dto.whatsApp,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        thumbnail: dto.thumbnail,
        gMapUrl: dto.gMapUrl,
        isActive: dto.isActive,
        isArchived: dto.isArchived,
        updatedAt: new Date(),
      },
    });

    // Create LocationDetails if provided
    if (dto.details) {
      await prisma.locationDetails.create({
        data: {
          locationId: location.id,
          description: dto.details.description ?? "",
          termsSummary: dto.details.termsSummary,
          termsUrl: dto.details.termsUrl,
          bookingUrl: dto.details.bookingUrl,
          webUrl: dto.details.webUrl,
          email: dto.details.email,
          instagramUrl: dto.details.instagramUrl,
          facebookUrl: dto.details.facebookUrl,
          phone: dto.details.phone,
          whatsApp: dto.details.whatsApp,
        },
      });
    }

    // Create LocationOperatingHrs if provided
    if (dto.operatingHrs && dto.operatingHrs.length > 0) {
      await prisma.locationOperatingHrs.createMany({
        data: dto.operatingHrs.map((hrs) => ({
          locationId: location.id,
          day: hrs.day,
          businessHrs: hrs.businessHrs,
        })),
      });
    }

    // Create LocationMedia if provided
    if (dto.media && dto.media.length > 0) {
      await prisma.locationMedia.createMany({
        data: dto.media.map((m) => ({
          locationId: location.id,
          url: m.url,
          mimeType: Helper.zodToPrismaEnum(MimeType, m.mimeType),
          sequence: m.sequence,
        })),
      });
    }

    // Refresh the parent merchant's search doc (regions/areas may have changed).
    void ServiceLocator.MerchantService.internal.reindexForSearch(
      location.merchantId,
    );

    // Re-read with media so the response echoes the persisted media rows.
    const created = await _getById(location.id, { withMedia: true });
    return mapLocationResponseDTO(created, { media: created.media });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateLocation;
  }
}

async function getLocationById(
  id: string | number,
  {
    withMerchant,
    withDetails,
    withOperatingHrs,
    withMedia,
  }: {
    withMerchant?: boolean;
    withDetails?: boolean;
    withOperatingHrs?: boolean;
    withMedia?: boolean;
  },
): Promise<LocationResponseDTO> {
  const location = await _getById(id, {
    withMerchant,
    withDetails,
    withOperatingHrs,
    withMedia,
  });

  return mapLocationResponseDTO(location, {
    merchant: location.merchant,
    details: location.details,
    operatingHrs: location.operatingHrs,
    media: location.media,
  });
}

async function updateLocation(
  id: string | number,
  dto: UpdateLocationDTO,
): Promise<LocationResponseDTO> {
  try {
    const existing = await _getById(id, { withMerchant: false });

    const updated = await prisma.location.update({
      where: {
        id: existing.id,
      },
      data: {
        // merchantId is intentionally not updatable — a location stays under
        // the merchant it was created for and cannot be moved across tenants.
        name: dto.name ?? existing.name,
        address: dto.address ?? existing.address,
        sgDistrict: dto.sgDistrict ?? existing.sgDistrict,
        sgRegion:
          dto.sgRegion !== undefined
            ? Helper.zodToPrismaEnum(SG_REGIONS, dto.sgRegion)
            : existing.sgRegion,
        locationType:
          dto.locationType !== undefined
            ? Helper.zodToPrismaEnum(LOCATION_TYPE, dto.locationType)
            : existing.locationType,
        postalCode: dto.postalCode ?? existing.postalCode,
        lat: dto.lat ?? existing.lat,
        long: dto.long ?? existing.long,
        phone: dto.phone ?? existing.phone,
        email: dto.email ?? existing.email,
        whatsApp: dto.whatsApp ?? existing.whatsApp,
        ageMin: dto.ageMin ?? existing.ageMin,
        ageMax: dto.ageMax ?? existing.ageMax,
        thumbnail: dto.thumbnail ?? existing.thumbnail,
        gMapUrl: dto.gMapUrl ?? existing.gMapUrl,
        isActive: dto.isActive ?? existing.isActive,
        isArchived: dto.isArchived ?? existing.isArchived,
        updatedAt: new Date(),
      },
    });

    // Upsert LocationDetails if provided
    if (dto.details) {
      await prisma.locationDetails.upsert({
        where: { locationId: updated.id },
        update: {
          description: dto.details.description ?? undefined,
          termsSummary: dto.details.termsSummary ?? undefined,
          termsUrl: dto.details.termsUrl ?? undefined,
          bookingUrl: dto.details.bookingUrl ?? undefined,
          webUrl: dto.details.webUrl ?? undefined,
          email: dto.details.email ?? undefined,
          instagramUrl: dto.details.instagramUrl ?? undefined,
          facebookUrl: dto.details.facebookUrl ?? undefined,
          phone: dto.details.phone ?? undefined,
          whatsApp: dto.details.whatsApp ?? undefined,
        },
        create: {
          locationId: updated.id,
          description: dto.details.description ?? "",
          termsSummary: dto.details.termsSummary,
          termsUrl: dto.details.termsUrl,
          bookingUrl: dto.details.bookingUrl,
          webUrl: dto.details.webUrl,
          email: dto.details.email,
          instagramUrl: dto.details.instagramUrl,
          facebookUrl: dto.details.facebookUrl,
          phone: dto.details.phone,
          whatsApp: dto.details.whatsApp,
        },
      });
    }

    // Replace LocationOperatingHrs if provided
    if (dto.operatingHrs) {
      await prisma.$transaction([
        prisma.locationOperatingHrs.deleteMany({
          where: { locationId: updated.id },
        }),
        ...(dto.operatingHrs.length > 0
          ? [
              prisma.locationOperatingHrs.createMany({
                data: dto.operatingHrs.map((hrs) => ({
                  locationId: updated.id,
                  day: hrs.day,
                  businessHrs: hrs.businessHrs,
                })),
              }),
            ]
          : []),
      ]);
    }

    // Replace LocationMedia if provided
    if (dto.media) {
      await prisma.$transaction([
        prisma.locationMedia.deleteMany({
          where: { locationId: updated.id },
        }),
        ...(dto.media.length > 0
          ? [
              prisma.locationMedia.createMany({
                data: dto.media.map((m) => ({
                  locationId: updated.id,
                  url: m.url,
                  mimeType: Helper.zodToPrismaEnum(MimeType, m.mimeType),
                  sequence: m.sequence,
                })),
              }),
            ]
          : []),
      ]);
    }

    void ServiceLocator.MerchantService.internal.reindexForSearch(
      updated.merchantId,
    );
    // A location's searchable fields feed every product doc at that location;
    // refresh those product docs too.
    void ServiceLocator.ProductService.internal.reindexProductsForLocation(
      updated.id,
    );

    // Re-read with media so the response echoes the persisted media rows.
    const result = await _getById(updated.id, { withMedia: true });
    return mapLocationResponseDTO(result, { media: result.media });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateLocation;
  }
}

async function archiveLocation(
  id: string | number,
): Promise<LocationResponseDTO> {
  try {
    await _getById(id, {});

    const location = await prisma.location.update({
      where: { id: Number(id) },
      data: { isArchived: true, updatedAt: new Date() },
    });

    void ServiceLocator.MerchantService.internal.reindexForSearch(
      location.merchantId,
    );

    return mapLocationResponseDTO(location, {});
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateLocation;
  }
}

//////////////////////////////
// Exports
//////////////////////////////

export const LocationService: ILocationService = {
  createLocation,
  getLocationById,
  updateLocation,
  archiveLocation,
};

//////////////////////////////
// Helper Methods
//////////////////////////////

async function _findById(
  id: string | number,
  {
    withMerchant,
    withDetails,
    withOperatingHrs,
    withMedia,
  }: {
    withMerchant?: boolean;
    withDetails?: boolean;
    withOperatingHrs?: boolean;
    withMedia?: boolean;
  } = {},
): Promise<LocationExtended | null> {
  return await prisma.location.findUnique({
    where: {
      id: Number(id),
    },
    include: {
      merchant: withMerchant,
      details: withDetails,
      operatingHrs: withOperatingHrs,
      media: withMedia,
    },
  });
}

async function _getById(
  id: string | number,
  {
    withMerchant,
    withDetails,
    withOperatingHrs,
    withMedia,
  }: {
    withMerchant?: boolean;
    withDetails?: boolean;
    withOperatingHrs?: boolean;
    withMedia?: boolean;
  } = {},
): Promise<LocationExtended> {
  try {
    const location = await _findById(id, {
      withMerchant,
      withDetails,
      withOperatingHrs,
      withMedia,
    });
    if (!location) throw NotFoundError.Location;

    return location;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchLocaiton;
  }
}
