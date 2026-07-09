import { BadRequestError } from "../../errors/domains/BadRequestError";
import { CreateLocationUserDTO } from "../../shared/dtos/LocationUserDTOs";
import { CreateMerchantUserDTO } from "../../shared/dtos/MerchantUserDTOs";
import { LOCATION_ROLE, MERCHANT_ROLE } from "../../shared/enums";
import NumberUtils from "../numberUtils";

export function validateCreateMerchantUserDTO(dto: CreateMerchantUserDTO) {
  let errors: string[] = [];
  const { userId, role } = dto;

  if (!NumberUtils.isValidNumber(userId) || dto.userId <= 0)
    errors.push(`Invalid userId provided!`);

  const validRoles = Object.values(MERCHANT_ROLE)
    .map((_role) => role === _role)
    .filter((valid) => valid);
  if (validRoles.length === 0) errors.push(`Invalid role provided!`);

  if (errors.length) throw BadRequestError.CreateMerchantUser(errors);
}

export function validateCreateLocationUserDTO(dto: CreateLocationUserDTO) {
  let errors: string[] = [];
  const { userId, role } = dto;

  if (!NumberUtils.isValidNumber(userId) || dto.userId <= 0)
    errors.push(`Invalid userId provided!`);

  const validRoles = Object.values(LOCATION_ROLE)
    .map((_role) => role === _role)
    .filter((valid) => valid);
  if (validRoles.length === 0) errors.push(`Invalid role provided!`);

  if (errors.length) throw BadRequestError.CreateLocationUser(errors);
}
