import prisma from "../../config/prisma";
import {
  mapMerchantUserResponseDTO,
  MerchantUserResponseDTO,
} from "../../shared/dtos/MerchantUserDTOs";
import { IMerchantUserService } from "./service.interface";

async function findMerchantUserByUserId(
  userId: string | number,
  { withRole, withUser }: { withRole?: boolean; withUser?: boolean } = {}
): Promise<MerchantUserResponseDTO | null> {
  const merchantUser = await prisma.merchantUser.findFirst({
    where: {
      userId: Number(userId),
    },
    include: {
      merchantRole: withRole,
      user: withUser,
    },
  });
  if (!merchantUser) return null;

  return mapMerchantUserResponseDTO(merchantUser, {
    role: merchantUser.merchantRole,
    user: merchantUser.user,
  });
}

export const MerchantUserService: IMerchantUserService = {
  findMerchantUserByUserId,
};
