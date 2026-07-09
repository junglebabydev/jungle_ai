import { LocationUser, Prisma } from "@prisma/client";
import { ServiceLocator } from "..";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreateLocationUserDTO,
  LocationUserResponseDTO,
  mapLocationUserResponseDTO,
} from "../../shared/dtos/LocationUserDTOs";
import { LocationUserWithRole } from "../../shared/types/location-user";
import { validateCreateLocationUserDTO } from "../../utils/validations/userValidations";
import { ILocationUserServiceInernal } from "./service.interface";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function createLocationUser(
  locationId: number,
  dto: CreateLocationUserDTO,
  tx?: Prisma.TransactionClient,
): Promise<LocationUserResponseDTO> {
  const db = tx ?? prisma;

  try {
    // Validate DTO
    validateCreateLocationUserDTO(dto);

    // Fetch Role
    const role = await ServiceLocator.RoleService.internal.getRoleByName(
      dto.role,
    );

    // Create Location User
    const locationUser = await db.locationUser.create({
      data: {
        userId: dto.userId,
        merchantLocationId: locationId,
        locationRoleId: role.id,
      },
      include: {
        user: true,
        locationRole: true,
      },
    });

    return mapLocationUserResponseDTO(locationUser, {
      user: locationUser.user,
      role: locationUser.locationRole,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateLocationUser();
  }
}

async function getLocationUserByUserIdAndLocationId(
  userId: string | number,
  locationId: string | number,
  { withRole }: { withRole?: boolean },
): Promise<LocationUserWithRole | null> {
  try {
    const locationUser = await prisma.locationUser.findFirst({
      where: {
        userId: Number(userId),
        merchantLocationId: Number(locationId),
      },
      include: {
        locationRole: withRole,
      },
    });

    return locationUser;
  } catch (e) {
    throw BadRequestError.FetchLocationUser;
  }
}

async function findLocationUserByUserIdAndMerchantId(
  userId: string | number,
  merchantId: string | number,
) {
  return prisma.locationUser.findFirst({
    where: {
      userId: Number(userId),
      merchantLocation: { merchantId: Number(merchantId) },
    },
  });
}

async function findActiveLocationMembershipByUserId(
  userId: string | number,
) {
  // Returns the first LocationUser row whose parent location AND its parent
  // merchant are both non-archived. Used by signIn to gate users out when
  // all their tenants are archived.
  return prisma.locationUser.findFirst({
    where: {
      userId: Number(userId),
      merchantLocation: {
        isArchived: false,
        merchant: { isArchived: false },
      },
    },
  });
}

async function getLocationUserById(
  locationUserId: string | number,
): Promise<LocationUser> {
  try {
    const row = await prisma.locationUser.findUnique({
      where: { id: Number(locationUserId) },
    });
    if (!row) throw NotFoundError.LocationUser;
    return row;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw NotFoundError.LocationUser;
  }
}

async function deleteLocationUser(
  locationUserId: string | number,
  tx?: Prisma.TransactionClient,
): Promise<LocationUser> {
  const db = tx ?? prisma;

  try {
    return await db.locationUser.delete({
      where: { id: Number(locationUserId) },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.DeleteLocationUser;
  }
}

//////////////////////////////
// Exports
//////////////////////////////

export const LocationUserServiceInternal: ILocationUserServiceInernal = {
  createLocationUser,
  getLocationUserByUserIdAndLocationId,
  findLocationUserByUserIdAndMerchantId,
  findActiveLocationMembershipByUserId,
  getLocationUserById,
  deleteLocationUser,
};
