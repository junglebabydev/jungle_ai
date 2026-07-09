import { Role } from "@prisma/client";
import {
  LOCATION_ROLE,
  MERCHANT_ROLE,
  PLATFORM_ROLE,
} from "../../shared/enums";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { IRoleServiceInternal } from "./service.interface";

//////////////////////////////
// Internal Service IMPL
//////////////////////////////

async function getRoleByName(
  name: PLATFORM_ROLE | MERCHANT_ROLE | LOCATION_ROLE
): Promise<Role> {
  try {
    const role = await prisma.role.findFirst({
      where: {
        name,
      },
    });
    if (!role) throw NotFoundError.Role;

    return role;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchRole;
  }
}

//////////////////////////////
// Exports
//////////////////////////////

export const RoleServiceInternal: IRoleServiceInternal = {
  getRoleByName,
};
