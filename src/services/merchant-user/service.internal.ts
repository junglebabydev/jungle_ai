import { Prisma } from "@prisma/client";
import { ServiceLocator } from "..";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CreateMerchantUserDTO,
  mapMerchantUserResponseDTO,
  MerchantUserResponseDTO,
} from "../../shared/dtos/MerchantUserDTOs";
import { MerchantUserWithRole } from "../../shared/types/merchant-user";
import { validateCreateMerchantUserDTO } from "../../utils/validations/userValidations";
import { IMerchantUserServiceInternal } from "./service.interface";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function createMerchantUser(
  merchantId: number,
  dto: CreateMerchantUserDTO,
  tx?: Prisma.TransactionClient
): Promise<MerchantUserResponseDTO> {
  const db = tx ?? prisma;

  try {
    // Validate DTO
    validateCreateMerchantUserDTO(dto);

    // Fetch Role
    const role = await ServiceLocator.RoleService.internal.getRoleByName(
      dto.role
    );

    // Create Merchant User
    const merchantUser = await db.merchantUser.create({
      data: {
        userId: dto.userId,
        merchantId: merchantId,
        merchantRoleId: role.id,
        isSuspended: false,
        joinedAt: new Date(),
      },
      include: {
        user: true,
        merchantRole: true,
      },
    });

    return mapMerchantUserResponseDTO(merchantUser, {
      user: merchantUser.user,
      role: merchantUser.merchantRole,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateMerchantUser();
  }
}

async function getMerchantUserByUserIdMerchantId(
  userId: string | number,
  merchantId: string | number,
  { withRole }: { withRole?: boolean }
): Promise<MerchantUserWithRole | null> {
  try {
    const merchantUser = await prisma.merchantUser.findFirst({
      where: {
        userId: Number(userId),
        merchantId: Number(merchantId),
      },
      include: {
        merchantRole: withRole,
      },
    });

    return merchantUser;
  } catch (e) {
    throw BadRequestError.FetchMerchantUser;
  }
}

async function findActiveMerchantMembershipByUserId(
  userId: string | number,
) {
  // Returns the first MerchantUser row whose parent merchant is not archived
  // AND whose membership is not suspended. Used by signIn to gate users out
  // when all their tenants are archived.
  return prisma.merchantUser.findFirst({
    where: {
      userId: Number(userId),
      isSuspended: false,
      merchant: { isArchived: false },
    },
  });
}

//////////////////////////////
// Exports
//////////////////////////////

export const MerchantUserServiceInternal: IMerchantUserServiceInternal = {
  createMerchantUser,
  getMerchantUserByUserIdMerchantId,
  findActiveMerchantMembershipByUserId,
};
