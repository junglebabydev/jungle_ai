import { Role } from "@prisma/client";
import { RoleResponseDTO } from "../../shared/dtos/RoleDTOs";
import { IRoleService } from "./service.interface";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function getRoleById(id: string | number): Promise<RoleResponseDTO> {
  return await _getRoleById(id);
}

//////////////////////////////
// Exports
//////////////////////////////

export const RoleService: IRoleService = {
  getRoleById,
};

//////////////////////////////
// Helper Methods
//////////////////////////////

async function _findRoleById(id: string | number): Promise<Role | null> {
  return await prisma.role.findUnique({
    where: { id: Number(id) },
  });
}

async function _getRoleById(id: string | number): Promise<Role> {
  try {
    const role = await _findRoleById(id);
    if (!role) throw NotFoundError.Role;

    return role;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchRole;
  }
}
