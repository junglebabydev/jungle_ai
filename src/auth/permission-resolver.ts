import { AuthenticatedRequest } from "../shared/types/authenticated-request";
import RoleResolver from "./role-resolver";
import { ServiceLocator } from "../services";

/**
 * The (platform + optional merchant + optional location) context a permission
 * set is resolved for. `userId` is always required; merchant/location narrow
 * the scope.
 */
export type PermissionContext = {
  userId: number;
  merchantId?: number;
  // Nullable: a merchant-scoped AI conversation has no location. A falsy value
  // simply skips the merchant-inference and location-role lookups below.
  locationId?: number | null;
};

/**
 * Resolve all permission codes for a user in a given context. This is the RBAC
 * core shared by BOTH the `requirePermission` middleware (via
 * `resolvePermissionsForRequest`) and the in-process AI agent dispatcher — they
 * MUST resolve identically so the agent's internal tool calls get the same RBAC
 * backstop the HTTP middleware chain provides. Context = platform role (always)
 * + merchant role (if merchantId) + location role (if locationId).
 */
export async function resolvePermissions({
  userId,
  merchantId,
  locationId,
}: PermissionContext): Promise<Set<string>> {
  if (!userId) {
    return new Set();
  }

  // Important: infer merchantId from locationId when merchantId is not provided.
  let resolvedMerchantId = merchantId;
  if (!resolvedMerchantId && locationId) {
    const location =
      await ServiceLocator.LocationService.public.getLocationById(
        locationId,
        {},
      );
    resolvedMerchantId = location?.merchantId;
  }

  const roleIds: number[] = [];

  // 1) platform role (always)
  const platformRole = await RoleResolver.getPlatformRole(userId);
  if (platformRole) {
    roleIds.push(platformRole.id);
  }

  // 2) merchant role (if a merchant is in scope)
  if (resolvedMerchantId) {
    const merchantRole = await RoleResolver.getMerchantRole(
      userId,
      resolvedMerchantId,
    );
    if (merchantRole) {
      roleIds.push(merchantRole.id);
    }
  }

  // 3) location role (if a location is in scope)
  if (locationId) {
    const locationRole = await RoleResolver.getLocationRole(userId, locationId);
    if (locationRole) {
      roleIds.push(locationRole.id);
    }
  }

  if (!roleIds.length) return new Set();

  // 4) fetch permissions for all those roles
  const rolePermissions =
    await ServiceLocator.RolePermissionService.internal.getAllByRoleId(
      roleIds,
      { withPermission: true },
    );

  return new Set(rolePermissions.map((rp) => rp.permission.code));
}

/**
 * Request adapter: extract the (userId, merchantId, locationId) context from the
 * request (params first, then body — rule 09) and delegate to
 * `resolvePermissions`. This is what the `requirePermission` middleware calls.
 */
export async function resolvePermissionsForRequest(
  req: AuthenticatedRequest,
): Promise<Set<string>> {
  const auth = req.auth;
  if (!auth?.userId) {
    return new Set();
  }

  const userId = Number(auth.userId);

  const merchantId =
    (req.params?.merchantId && Number(req.params.merchantId)) ||
    (req.body?.merchantId && Number(req.body.merchantId)) ||
    undefined;

  const locationId =
    (req.params?.locationId && Number(req.params.locationId)) ||
    (req.body?.locationId && Number(req.body.locationId)) ||
    undefined;

  return resolvePermissions({ userId, merchantId, locationId });
}
