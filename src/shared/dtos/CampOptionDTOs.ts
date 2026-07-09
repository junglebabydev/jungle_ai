import {
  CampDetails,
  CampOption,
  PRICE_TYPE,
  Product,
  PRODUCT_TYPE,
  SG_REGIONS,
} from "@prisma/client";
import {
  mapProductResponseDTO,
  ProductOrderByKey,
  ProductResponseDTO,
} from "./ProductDTOs";
import NumberUtils from "../../utils/numberUtils";
import z from "zod";
import { Helper } from "../../utils/helper";
import { PaginatedRequestDTO } from "./PaginationDTO";
import {
  CampDetailsResponseDTO,
  mapCampDetailsResponseDTO,
} from "./CampDetailsDTOs";

export const CreateCampOptionBodySchema = z.object({
  name: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  startTime: z.string(),
  endTime: z.string(),
  ageMin: z.int().positive().optional(),
  ageMax: z.int().positive().optional(),
  capacity: z.int().positive().optional(),
  isAvailable: z.boolean().optional().default(true),
  price: z.number().optional(),
  priceType: Helper.prismaToZodEnum(PRICE_TYPE).optional(),
  isArchived: z.boolean().optional().default(false),
});

export type CreateCampOptionBodyDTO = z.infer<
  typeof CreateCampOptionBodySchema
>;

export type CreateCampOptionDTO = CreateCampOptionBodyDTO & {
  productId: number;
};

export const UpdateCampOptionSchema = CreateCampOptionBodySchema.partial();

export type UpdateCampOptionDTO = z.infer<typeof UpdateCampOptionSchema>;

export const CampOptionFilterQuerySchema = z.object({
  campId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
});

export const CampOptionFilterBodySchema = z.object({
  region: Helper.prismaToZodEnum(SG_REGIONS).optional(),
  tags: z.array(z.string()).optional(),
  age: z.number().int().positive().optional(),
  locationType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  startDate: z.coerce.date().optional(),
});

export type CampOptionFilterQuery = z.infer<
  typeof CampOptionFilterQuerySchema
> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type CampOptionFilterBody = z.infer<typeof CampOptionFilterBodySchema>;

export type CampOptionFilter = CampOptionFilterQuery & CampOptionFilterBody;

export type CampOptionResponseDTO = {
  id: number;
  optionID: string;
  productId: number;
  product?: ProductResponseDTO;
  campId?: number | null;
  camp?: CampDetailsResponseDTO;
  name: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;

  ageMin: number | null;
  ageMax: number | null;

  capacity: number | null;
  isAvailable: boolean;

  price: number | null;
  priceType: string | null;

  isArchived: boolean;
  createdAt: Date;
};

export function mapCampOptionResponseDTO(
  campOption: CampOption,
  { product, camp }: { product?: Product; camp?: CampDetails | null } = {},
): CampOptionResponseDTO {
  const mapped: CampOptionResponseDTO = {
    id: campOption.id,
    optionID: campOption.optionID,
    productId: campOption.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    campId: campOption.campDetailsId,
    camp: camp ? mapCampDetailsResponseDTO(camp) : undefined,
    name: campOption.name,
    startDate: campOption.startDate,
    endDate: campOption.endDate,
    startTime: campOption.startTime,
    endTime: campOption.endTime,
    ageMin: campOption.ageMin,
    ageMax: campOption.ageMax,
    capacity: campOption.capacity,
    isAvailable: campOption.isAvailable,
    price: NumberUtils.decimalToNumber(campOption.price),
    priceType: campOption.priceType,
    isArchived: campOption.isArchived,
    createdAt: campOption.createdAt,
  };

  return mapped;
}
