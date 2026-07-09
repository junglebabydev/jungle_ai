import { LocationUser, Prisma } from "@prisma/client";
import {
  CreateLocationUserDTO,
  LocationUserResponseDTO,
} from "../../shared/dtos/LocationUserDTOs";
import { LocationUserWithRole } from "../../shared/types/location-user";

export interface ILocationUserServiceInernal {
  createLocationUser(
    locationId: number,
    dto: CreateLocationUserDTO,
    tx?: Prisma.TransactionClient
  ): Promise<LocationUserResponseDTO>;
  getLocationUserByUserIdAndLocationId(
    userId: string | number,
    locationId: string | number,
    { withRole }: { withRole?: boolean }
  ): Promise<LocationUserWithRole | null>;
  findLocationUserByUserIdAndMerchantId(
    userId: string | number,
    merchantId: string | number
  ): Promise<LocationUser | null>;
  findActiveLocationMembershipByUserId(
    userId: string | number
  ): Promise<LocationUser | null>;
  getLocationUserById(
    locationUserId: string | number
  ): Promise<LocationUser>;
  deleteLocationUser(
    locationUserId: string | number,
    tx?: Prisma.TransactionClient
  ): Promise<LocationUser>;
}

export interface ILocationUserService {
  findLocationUsersByUserId(
    userId: string | number,
    { withRole, withUser }: { withRole?: boolean; withUser?: boolean }
  ): Promise<LocationUserResponseDTO[]>;
  findLocationUsersByLocationId(
    locationId: string | number,
    { withRole, withUser }: { withRole?: boolean; withUser?: boolean }
  ): Promise<LocationUserResponseDTO[]>;
  deleteLocationUser(
    merchantId: string | number,
    locationUserId: string | number
  ): Promise<{ success: true }>;
}
