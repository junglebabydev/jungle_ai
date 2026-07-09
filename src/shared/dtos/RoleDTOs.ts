import { Role } from "@prisma/client";

export type RoleResponseDTO = {
  id: number;
  name: string;
  scope: string;
  createdAt: Date;
};

export function mapRoleResponseDTO(role: Role): RoleResponseDTO {
  const mapped: RoleResponseDTO = {
    id: role.id,
    name: role.name,
    scope: role.scope,
    createdAt: role.createdAt,
  } as const;

  return mapped;
}
