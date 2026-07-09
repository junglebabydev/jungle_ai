import z from "zod";
import { Helper } from "../../utils/helper";
import { stripSignedParams } from "../../utils/storageUrl";
import {
  Location,
  Merchant,
  PACKAGE_KIND,
  PackageTemplate,
  Product,
} from "@prisma/client";
import { mapMerchantResponseDTO, MerchantResonseDTO } from "./MerchantDTOs";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import NumberUtils from "../../utils/numberUtils";

export const CreatePackageTemplateBodySchema = z.object({
  locationId: z.int().optional(),
  productId: z.int().optional(),
  name: z.string().min(1),
  kind: Helper.prismaToZodEnum(PACKAGE_KIND),
  creditsIncluded: z.int().positive().optional(),
  billingPeriodMonths: z.int().positive().optional(),
  validityDays: z.int().positive().optional(),
  canShareSiblings: z.boolean().optional().default(false),
  price: z.number().positive(),
  description: z.string().optional(),
  thumbnailUrl: z.string().transform(stripSignedParams).optional(),
  isPublic: z.boolean().optional().default(true),
});

export type CreatePackageTemplateBodyDTO = z.infer<
  typeof CreatePackageTemplateBodySchema
>;

export type CreatePackageTemplateDTO = CreatePackageTemplateBodyDTO & {
  merchantId: number;
};

export const UpdatePackageTemplateBodySchema = z.object({
  name: z.string().min(1).optional(),
  kind: Helper.prismaToZodEnum(PACKAGE_KIND).optional(),
  creditsIncluded: z.int().positive().optional(),
  billingPeriodMonths: z.int().positive().optional(),
  validityDays: z.int().positive().optional(),
  canShareSiblings: z.boolean().optional(),
  price: z.number().positive().optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().transform(stripSignedParams).optional(),
  isPublic: z.boolean().optional(),
});

export type UpdatePackageTemplateBodyDTO = z.infer<
  typeof UpdatePackageTemplateBodySchema
>;

export type UpdatePackageTemplateDTO = UpdatePackageTemplateBodyDTO & {
  packageTemplateId: number;
  merchantId: number;
  locationId?: number;
  productId?: number;
};

export type UpdatePackageTemplateInternalDTO = {
  packageTemplateId: number;
  name?: string;
  kind?: PACKAGE_KIND;
  creditsIncluded?: number;
  billingPeriodMonths?: number;
  validityDays?: number;
  canShareSiblings?: boolean;
  price?: number;
  description?: string;
  thumbnailUrl?: string;
  isPublic?: boolean;
};

export const PackageTemplateFilterSchema = z.object({
  kind: Helper.prismaToZodEnum(PACKAGE_KIND).optional(),
});

export type PackageTemplateFilter = z.infer<typeof PackageTemplateFilterSchema>;

export type PackageTemplateResponseDTO = {
  id: number;
  templateID: string;
  merchantId: number;
  merchant?: MerchantResonseDTO;
  locationId: number | null;
  location?: LocationResponseDTO | null;
  productId?: number | null;
  product?: ProductResponseDTO | null;
  name: string;
  kind: PACKAGE_KIND;
  creditsIncluded: number | null;
  billingPeriodMonths: number | null;
  validityDays: number | null;
  canShareSiblings: boolean;
  price: number;
  description: string | null;
  thumbnailUrl: string | null;
  stripePriceId: string | null;
  isPublic: boolean;
  isArchived: boolean;
  createdAt: Date;
};

export function mapPackageTemplateResponseDTO(
  packageTemplate: PackageTemplate,
  {
    merchant,
    location,
    product,
  }: {
    merchant?: Merchant;
    location?: Location | null;
    product?: Product | null;
  } = {}
): PackageTemplateResponseDTO {
  const mapped: PackageTemplateResponseDTO = {
    id: packageTemplate.id,
    templateID: packageTemplate.templateID,
    merchantId: packageTemplate.merchantId,
    merchant: merchant ? mapMerchantResponseDTO(merchant, {}) : undefined,
    locationId: packageTemplate.locationId,
    location: location ? mapLocationResponseDTO(location) : undefined,
    productId: packageTemplate.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    name: packageTemplate.name,
    kind: packageTemplate.kind,
    creditsIncluded: packageTemplate.creditsIncluded,
    billingPeriodMonths: packageTemplate.billingPeriodMonths,
    validityDays: packageTemplate.validityDays,
    canShareSiblings: packageTemplate.canShareSiblings,
    price: NumberUtils.decimalToNumber(packageTemplate.price),
    description: packageTemplate.description,
    thumbnailUrl: packageTemplate.thumbnailUrl,
    stripePriceId: packageTemplate.stripePriceId,
    isPublic: packageTemplate.isPublic,
    isArchived: packageTemplate.isArchived,
    createdAt: packageTemplate.createdAt,
  };

  return mapped;
}
