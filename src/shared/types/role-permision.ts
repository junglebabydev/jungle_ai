import { Prisma } from "@prisma/client";

const rolePermissionExpanded =
  Prisma.validator<Prisma.RolePermissionDefaultArgs>()({
    include: {
      role: true,
      permission: true,
    },
  });

export type RolePermissionExpanded = Prisma.RolePermissionGetPayload<
  typeof rolePermissionExpanded
>;
