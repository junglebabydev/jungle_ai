import prisma from "../../config/prisma";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { IRolePermissionServiceInternal } from "./service.interface";

async function getAllByRoleId(
  roleIds: number[],
  { withRole, withPermission }: { withRole?: boolean; withPermission?: boolean }
) {
  try {
    return await prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: withPermission, role: withRole },
    });
  } catch (e) {
    throw BadRequestError.FetchRolePermissionMapping;
  }
}

export const RolePermissionServiceInternal: IRolePermissionServiceInternal = {
  getAllByRoleId,
};
