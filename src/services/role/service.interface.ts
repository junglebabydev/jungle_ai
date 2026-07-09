import { Role } from "@prisma/client";
import {
  LOCATION_ROLE,
  MERCHANT_ROLE,
  PLATFORM_ROLE,
} from "../../shared/enums";
import { RoleResponseDTO } from "../../shared/dtos/RoleDTOs";

export interface IRoleServiceInternal {
  getRoleByName(
    name: PLATFORM_ROLE | MERCHANT_ROLE | LOCATION_ROLE
  ): Promise<Role>;
}

export interface IRoleService {
  getRoleById(id: string | number): Promise<RoleResponseDTO>;
}
