import { Location, Merchant, ProductCategory } from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapMerchantResponseDTO, MerchantResonseDTO } from "./MerchantDTOs";
import z from "zod";
import { stripSignedParams } from "../../utils/storageUrl";

export const CreateProductCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  thumbnail: z.url().transform(stripSignedParams).optional(),
  isArchived: z.boolean().optional(),
});

export type CreateProductCategoryDTO = z.infer<
  typeof CreateProductCategorySchema
>;

export type ProductCategoryFilter = {
  locationId?: number;
  merchantId?: number;
};

export type ProductCategoryResonseDTO = {
  id: number;
  categoryID: string;
  locationId: number;
  location?: LocationResponseDTO | null;
  merchantId: number;
  merchant?: MerchantResonseDTO | null;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapProductCategoryResponseDTO(
  category: ProductCategory,
  { location, merchant }: { location?: Location; merchant?: Merchant } = {}
): ProductCategoryResonseDTO {
  const mapped: ProductCategoryResonseDTO = {
    id: category.id,
    categoryID: category.categoryID,
    locationId: category.locationId,
    location: location ? mapLocationResponseDTO(location, {}) : null,
    merchantId: category.merchantId,
    merchant: merchant ? mapMerchantResponseDTO(merchant, {}) : null,
    name: category.name,
    description: category.description,
    thumbnail: category.thumbnail,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };

  return mapped;
}
