import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { ServiceLocator } from "..";
import {
  LocationUserResponseDTO,
  mapLocationUserResponseDTO,
} from "../../shared/dtos/LocationUserDTOs";
import { ILocationUserService } from "./service.interface";
import { LocationUserServiceInternal } from "./service.internal";

async function findLocationUsersByUserId(
  userId: string | number,
  { withRole, withUser }: { withRole?: boolean; withUser?: boolean } = {}
): Promise<LocationUserResponseDTO[]> {
  const locationUsers = await prisma.locationUser.findMany({
    where: { userId: Number(userId) },
    include: {
      locationRole: withRole,
      user: withUser,
    },
  });

  return locationUsers.map((locationUser) =>
    mapLocationUserResponseDTO(locationUser, {
      role: locationUser.locationRole,
      user: locationUser.user,
    })
  );
}

async function findLocationUsersByLocationId(
  locationId: string | number,
  { withRole, withUser }: { withRole?: boolean; withUser?: boolean } = {}
): Promise<LocationUserResponseDTO[]> {
  try {
    const locationUsers = await prisma.locationUser.findMany({
      where: { merchantLocationId: Number(locationId) },
      include: {
        locationRole: withRole,
        user: withUser,
      },
    });

    return locationUsers.map((locationUser) =>
      mapLocationUserResponseDTO(locationUser, {
        role: locationUser.locationRole,
        user: locationUser.user,
      })
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchLocationUser;
  }
}

async function deleteLocationUser(
  merchantId: string | number,
  locationUserId: string | number,
): Promise<{ success: true }> {
  try {
    // Load the row (throws NotFoundError.LocationUser if missing) so we can
    // verify cross-tenant safety before deleting.
    const existing =
      await LocationUserServiceInternal.getLocationUserById(locationUserId);

    // Confirm the LocationUser belongs to a location under THIS merchant. A
    // merchant admin must not be able to delete a membership from another
    // merchant's location by guessing IDs.
    const location =
      await ServiceLocator.LocationService.internal.findLocationById(
        existing.merchantLocationId,
      );

    if (!location || location.merchantId !== Number(merchantId)) {
      // Same error code as a real miss so we don't leak existence across
      // tenants.
      throw NotFoundError.LocationUser;
    }

    await LocationUserServiceInternal.deleteLocationUser(locationUserId);

    return { success: true };
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    console.error("[deleteLocationUser] unexpected error:", e);
    throw BadRequestError.DeleteLocationUser;
  }
}

export const LocationUserService: ILocationUserService = {
  findLocationUsersByUserId,
  findLocationUsersByLocationId,
  deleteLocationUser,
};
