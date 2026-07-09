import {
  BirthdayDetailsFilter,
  BirthdayDetailsResponseDTO,
  CreateBirthdayDTO,
  UpdateBirthdayDTO,
} from "../../shared/dtos/BirthdayDetailsDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";
import { ProductOrderByKey } from "../../shared/dtos/ProductDTOs";

export interface IBirthdayDetailsService {
  createBirthday(
    locationId: string | number,
    dto: CreateBirthdayDTO,
  ): Promise<BirthdayDetailsResponseDTO>;

  getBirthdayDetailsById(
    id: string | number,
    {
      withProduct,
      withCategory,
      withAddons,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withAddons?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<BirthdayDetailsResponseDTO>;

  getBirthdayDetailsByProduct(
    productId: string | number,
    {
      withProduct,
      withCategory,
      withAddons,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withAddons?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<BirthdayDetailsResponseDTO>;

  listBirthdays(
    filter: BirthdayDetailsFilter,
    {
      withProduct,
      withCategory,
      includeArchived,
      withAddons,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      includeArchived?: boolean;
      withAddons?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<
    PaginatedResponseDTO<BirthdayDetailsResponseDTO, ProductOrderByKey>
  >;

  updateBirthday(
    id: string | number,
    productId: string | number,
    dto: UpdateBirthdayDTO,
  ): Promise<BirthdayDetailsResponseDTO>;
}
