import { Merchant } from "@prisma/client";
import {
  CreateMerchantDTO,
  MerchantFilter,
  MerchantOrderKey,
  MerchantResonseDTO,
  UpdateMerchantDTO,
} from "../../shared/dtos/MerchantDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";

export interface IMerchantServiceInternal {
  findMerchantById(id: string | number): Promise<Merchant | null>;

  /**
   * Refresh a merchant in the search index with its enriched (denormalized)
   * regions/categories/etc. Called by the location/product-category cascade
   * hooks when a child changes. Non-fatal; fire-and-forget friendly.
   */
  reindexForSearch(id: string | number): Promise<void>;
  /**
   * The providers a parent is shown before they've said what they want, in the
   * order a platform admin curated. Ids only — the concierge hands them to search,
   * which hydrates the cards.
   */
  findFeaturedMerchantIds(): Promise<number[]>;
}

export interface IMerchantService {
  createMerchant(dto: CreateMerchantDTO): Promise<MerchantResonseDTO>;
  getMerchantById(
    id: string | number,
    { withLocations }: { withLocations?: boolean },
  ): Promise<MerchantResonseDTO>;
  listMerchants(
    filter: MerchantFilter,
    {
      withLocations,
      withLocationDetails,
      withLocationOperatingHrs,
      includeArchived,
    }: {
      withLocations?: boolean;
      withLocationDetails?: boolean;
      withLocationOperatingHrs?: boolean;
      includeArchived?: boolean;
    },
  ): Promise<PaginatedResponseDTO<MerchantResonseDTO, MerchantOrderKey>>;
  updateMerchant(
    id: string | number,
    dto: UpdateMerchantDTO,
  ): Promise<MerchantResonseDTO>;
  archiveMerchant(id: string | number): Promise<MerchantResonseDTO>;
}
