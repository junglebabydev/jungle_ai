import {
  CreateDropInDTO,
  DropInDetailsFilter,
  DropInDetailsResponseDTO,
  UpdateDropInDTO,
} from "../../shared/dtos/DropInDetailsDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";
import { ProductOrderByKey } from "../../shared/dtos/ProductDTOs";

export interface IDropInDetailsService {
  createDropIn(
    locationId: number,
    dto: CreateDropInDTO,
  ): Promise<DropInDetailsResponseDTO>;

  getDropInDetailsById(
    id: string | number,
    {
      withProduct,
      withCategory,
      withSchedules,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withSchedules?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<DropInDetailsResponseDTO>;

  getDropInDetailsByProduct(
    productId: string | number,
    {
      withProduct,
      withCategory,
      withSchedules,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withSchedules?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<DropInDetailsResponseDTO>;

  listDropIns(
    filter: DropInDetailsFilter,
    {
      withProduct,
      withCategory,
      includeArchived,
      withSchedules,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      includeArchived?: boolean;
      withSchedules?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<PaginatedResponseDTO<DropInDetailsResponseDTO, ProductOrderByKey>>;

  updateDropIn(
    id: string | number,
    productId: string | number,
    dto: UpdateDropInDTO,
  ): Promise<DropInDetailsResponseDTO>;
}
