import { Merchant, MerchantUser, Role, User } from "@prisma/client";
import { MERCHANT_ROLE } from "../enums";
import { mapMerchantResponseDTO, MerchantResonseDTO } from "./MerchantDTOs";
import { mapRoleResponseDTO, RoleResponseDTO } from "./RoleDTOs";
import { mapUserResponseDTO, UserResponseDTO } from "./UserDTOs";

export type MerchantUserResponseDTO = {
  id: number;
  userId: number;
  user?: UserResponseDTO;
  merchantId: number;
  merchant?: MerchantResonseDTO;
  merchantRoleId: number;
  merchantRole?: RoleResponseDTO;
  joinedAt: Date | null;
};

export type CreateMerchantUserDTO = {
  userId: number;
  role: MERCHANT_ROLE;
};

export function mapMerchantUserResponseDTO(
  merchantUser: MerchantUser,
  { user, merchant, role }: { user?: User; merchant?: Merchant; role?: Role }
): MerchantUserResponseDTO {
  const mapped: MerchantUserResponseDTO = {
    id: merchantUser.id,
    userId: merchantUser.userId,
    user: user ? mapUserResponseDTO(user, {}) : undefined,
    merchantId: merchantUser.merchantId,
    merchant: merchant ? mapMerchantResponseDTO(merchant, {}) : undefined,
    merchantRoleId: merchantUser.merchantRoleId,
    merchantRole: role ? mapRoleResponseDTO(role) : undefined,
    joinedAt: merchantUser.joinedAt,
  } as const;

  return mapped;
}
