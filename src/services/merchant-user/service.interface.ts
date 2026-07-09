import { MerchantUser, Prisma } from "@prisma/client";
import {
  CreateMerchantUserDTO,
  MerchantUserResponseDTO,
} from "../../shared/dtos/MerchantUserDTOs";
import { MerchantUserWithRole } from "../../shared/types/merchant-user";

export interface IMerchantUserServiceInternal {
  createMerchantUser(
    merchantId: number,
    dto: CreateMerchantUserDTO,
    tx?: Prisma.TransactionClient
  ): Promise<MerchantUserResponseDTO>;
  getMerchantUserByUserIdMerchantId(
    userId: string | number,
    merchantId: string | number,
    { withRole }: { withRole?: boolean }
  ): Promise<MerchantUserWithRole | null>;
  findActiveMerchantMembershipByUserId(
    userId: string | number,
  ): Promise<MerchantUser | null>;
}

export interface IMerchantUserService {
  findMerchantUserByUserId(
    userId: string | number,
    { withRole, withUser }: { withRole?: boolean; withUser?: boolean }
  ): Promise<MerchantUserResponseDTO | null>;
}
