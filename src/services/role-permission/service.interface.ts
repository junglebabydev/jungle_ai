import { RolePermissionExpanded } from "../../shared/types/role-permision";

export interface IRolePermissionServiceInternal {
  getAllByRoleId(
    roleIds: number[],
    {
      withRole,
      withPermission,
    }: { withRole?: boolean; withPermission?: boolean }
  ): Promise<RolePermissionExpanded[]>;
}
