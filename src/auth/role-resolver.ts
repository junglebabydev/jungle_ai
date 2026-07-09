import { BadRequestError } from "../errors/domains/BadRequestError";
import { ServiceLocator } from "../services";

async function getPlatformRole(userId: string | number) {
  try {
    const user = await ServiceLocator.UserService.internal.getUserById(userId, {
      withRole: true,
    });

    return user?.platformRole;
  } catch (e) {
    throw BadRequestError.FetchPlatformRole;
  }
}

async function getMerchantRole(userId: number, merchantId: number) {
  try {
    const merchantUser =
      await ServiceLocator.MerchantUserService.internal.getMerchantUserByUserIdMerchantId(
        userId,
        merchantId,
        { withRole: true }
      );

    return merchantUser?.merchantRole;
  } catch (e) {
    throw BadRequestError.FetchMerchantRole;
  }
}

async function getLocationRole(userId: number, locationId: number) {
  try {
    const locationUser =
      await ServiceLocator.LocationUserService.internal.getLocationUserByUserIdAndLocationId(
        userId,
        locationId,
        { withRole: true }
      );

    return locationUser?.locationRole;
  } catch (e) {
    throw BadRequestError.FetchLocationRole;
  }
}

const RoleResolver = {
  getPlatformRole,
  getMerchantRole,
  getLocationRole,
};

export default RoleResolver;
