import {
  BIRTHDAY_ADDON_UNIT,
  BirthdayAddon,
  BirthdayDetails,
  Product,
} from "@prisma/client";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import NumberUtils from "../../utils/numberUtils";
import z from "zod";
import { Helper } from "../../utils/helper";
import {
  BirthdayDetailsResponseDTO,
  mapBirthdayDetailsResponseDTO,
} from "./BirthdayDetailsDTOs";

export const CreateBirthdayAddonBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unit: Helper.prismaToZodEnum(BIRTHDAY_ADDON_UNIT),
  unitPrice: z.number().positive(),
  isActive: z.boolean().optional().default(true),
});

export type CreateBirthdayAddonBodyDTO = z.infer<
  typeof CreateBirthdayAddonBodySchema
>;

export type CreateBirthdayAddonDTO = CreateBirthdayAddonBodyDTO & {
  productId: number;
};

export const UpdateBirthdayAddonSchema =
  CreateBirthdayAddonBodySchema.partial();

export type UpdateBirthdayAddonDTO = z.infer<typeof UpdateBirthdayAddonSchema>;

export type BirthdayAddonResponseDTO = {
  id: number;
  birthdayAddonID: string;
  productId: number;
  product?: ProductResponseDTO;
  birthdayId?: number | null;
  birthday?: BirthdayDetailsResponseDTO | null;
  name: string;
  description: string | null;
  unit: BIRTHDAY_ADDON_UNIT;
  unitPrice: number;
  isActive: boolean;
  createdAt: Date;
};

export function mapBirthdayAddonResponseDTO(
  birthdayAddon: BirthdayAddon,
  {
    product,
    birthday,
  }: { product?: Product; birthday?: BirthdayDetails | null } = {},
): BirthdayAddonResponseDTO {
  const mapped: BirthdayAddonResponseDTO = {
    id: birthdayAddon.id,
    birthdayAddonID: birthdayAddon.birthdayAddonID,
    productId: birthdayAddon.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    birthdayId: birthdayAddon.birthdayDetailsId,
    birthday: birthday ? mapBirthdayDetailsResponseDTO(birthday) : undefined,
    name: birthdayAddon.name,
    description: birthdayAddon.description,
    unit: birthdayAddon.unit,
    unitPrice: NumberUtils.decimalToNumber(birthdayAddon.unitPrice),
    isActive: birthdayAddon.isActive,
    createdAt: birthdayAddon.createdAt,
  };

  return mapped;
}
