import { Location, LocationUser, Role, User } from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapRoleResponseDTO, RoleResponseDTO } from "./RoleDTOs";
import { mapUserResponseDTO, UserResponseDTO } from "./UserDTOs";
import { LOCATION_ROLE } from "../enums";

export type CreateLocationUserDTO = {
  userId: number;
  role: LOCATION_ROLE;
};

export type LocationUserResponseDTO = {
  id: number;
  userId: number;
  merchantLocationId: number;
  locationRoleId: number;
  user?: UserResponseDTO;
  merchantLocation?: LocationResponseDTO;
  locationRole?: RoleResponseDTO;
};

export function mapLocationUserResponseDTO(
  locationUser: LocationUser,
  {
    user,
    location,
    role,
  }: { user?: User; location?: Location; role?: Role } = {}
): LocationUserResponseDTO {
  const mapped: LocationUserResponseDTO = {
    id: locationUser.id,
    userId: locationUser.userId,
    merchantLocationId: locationUser.merchantLocationId,
    locationRoleId: locationUser.locationRoleId,
    user: user ? mapUserResponseDTO(user, {}) : undefined,
    merchantLocation: location
      ? mapLocationResponseDTO(location, {})
      : undefined,
    locationRole: role ? mapRoleResponseDTO(role) : undefined,
  } as const;

  return mapped;
}
