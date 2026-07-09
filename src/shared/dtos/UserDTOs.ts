import { Role, User, USER_STATUS } from "@prisma/client";
import { mapRoleResponseDTO, RoleResponseDTO } from "./RoleDTOs";
import z from "zod";
import { Helper } from "../../utils/helper";
import { PLATFORM_ROLE } from "../enums";

export interface UserRoleDTO {
  id: number;
  name: string;
  scope: "platform" | "merchant" | "location";
  permissions: string[];
  merchantId?: number;
  locationId?: number;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  merchantId?: number;
  locationId?: number;
  firebaseId?: string;
}

export const UpdateUserRoleSchema = z.object({
  role: Helper.prismaToZodEnum(PLATFORM_ROLE),
});

export type UpdateUserRoleDTO = z.infer<typeof UpdateUserRoleSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;

export interface UserResponseDTO {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  status: USER_STATUS;
  platformRoleId: number;
  createdAt: Date;
  updatedAt: Date;
  role?: RoleResponseDTO;
}

export function mapUserResponseDTO(
  user: User,
  { role }: { role?: Role } = {}
): UserResponseDTO {
  const mapped: UserResponseDTO = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    platformRoleId: user.platformRoleId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: role ? mapRoleResponseDTO(role) : undefined,
  } as const;

  return mapped;
}
