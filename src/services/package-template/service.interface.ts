import { PackageTemplate, Prisma } from "@prisma/client";
import {
  CreatePackageTemplateDTO,
  PackageTemplateFilter,
  PackageTemplateResponseDTO,
  UpdatePackageTemplateDTO,
  UpdatePackageTemplateInternalDTO,
} from "../../shared/dtos/PackageTemplateDTOs";

export interface IPackageTemplateServiceInternal {
  getPackageTemplateById(
    id: string | number,
    tx?: Prisma.TransactionClient
  ): Promise<PackageTemplate>;

  updatePackageTemplate(
    dto: UpdatePackageTemplateInternalDTO,
    tx?: Prisma.TransactionClient
  ): Promise<PackageTemplate>;

  updateStripePriceId(
    id: string | number,
    stripePriceId: string,
    tx?: Prisma.TransactionClient
  ): Promise<PackageTemplate>;

  reindexForSearch(id: string | number): Promise<void>;
}

export interface IPackageTemplateService {
  createPackageTemplate(
    userId: string | number,
    dto: CreatePackageTemplateDTO
  ): Promise<PackageTemplateResponseDTO>;

  getPackageTemplateById(
    id: string | number,
    {
      withMerchant,
      withLocation,
      withProduct,
    }: { withMerchant?: boolean; withLocation?: boolean; withProduct?: boolean }
  ): Promise<PackageTemplateResponseDTO>;

  listPackageTemplatesByProduct(
    productId: string | number,
    {
      withMerchant,
      withLocation,
      withProduct,
    }: { withMerchant?: boolean; withLocation?: boolean; withProduct?: boolean }
  ): Promise<PackageTemplateResponseDTO[]>;

  listPackageTemplatesByLocation(
    locationId: string | number,
    {
      withMerchant,
      withLocation,
      withProduct,
    }: { withMerchant?: boolean; withLocation?: boolean; withProduct?: boolean }
  ): Promise<PackageTemplateResponseDTO[]>;

  listPackageTemplatesByMerchant(
    merchantId: string | number,
    {
      withMerchant,
      withLocation,
      withProduct,
    }: { withMerchant?: boolean; withLocation?: boolean; withProduct?: boolean }
  ): Promise<PackageTemplateResponseDTO[]>;

  listPublicPackageTemplates(
    filter: PackageTemplateFilter,
    {
      withMerchant,
      withLocation,
      withProduct,
    }: { withMerchant?: boolean; withLocation?: boolean; withProduct?: boolean }
  ): Promise<PackageTemplateResponseDTO[]>;

  updatePackageTemplate(
    dto: UpdatePackageTemplateDTO
  ): Promise<PackageTemplateResponseDTO>;

  archivePackageTemplate(
    id: string | number
  ): Promise<PackageTemplateResponseDTO>;
}
