import {
  CampDetailsFilter,
  CampDetailsResponseDTO,
  CreateCampDTO,
  UpdateCampDTO,
} from "../../shared/dtos/CampDetailsDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";
import { ProductOrderByKey } from "../../shared/dtos/ProductDTOs";

export interface ICampDetailsService {
  createCamp(
    locationId: string | number,
    dto: CreateCampDTO,
  ): Promise<CampDetailsResponseDTO>;

  getCampDetailsById(
    id: string | number,
    {
      withProduct,
      withCategory,
      withOptions,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withOptions?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<CampDetailsResponseDTO>;

  getCampDetailsByProduct(
    productId: string | number,
    {
      withProduct,
      withCategory,
      withOptions,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withOptions?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<CampDetailsResponseDTO>;

  listCamps(
    filter: CampDetailsFilter,
    {
      withProduct,
      withCategory,
      includeArchived,
      withOptions,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      includeArchived?: boolean;
      withOptions?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<PaginatedResponseDTO<CampDetailsResponseDTO, ProductOrderByKey>>;

  updateCamp(
    id: string | number,
    productId: string | number,
    dto: UpdateCampDTO,
  ): Promise<CampDetailsResponseDTO>;
}
