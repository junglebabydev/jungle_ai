import {
  ClassDetailsFilter,
  ClassDetailsResponseDTO,
  CreateClassDTO,
  UpdateClassDTO,
} from "../../shared/dtos/ClassDetailsDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";
import { ProductOrderByKey } from "../../shared/dtos/ProductDTOs";

export interface IClassDetailsService {
  createClass(
    locationId: string | number,
    dto: CreateClassDTO,
  ): Promise<ClassDetailsResponseDTO>;

  getClassDetailsById(
    id: string | number,
    {
      withProduct,
      withCategory,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<ClassDetailsResponseDTO>;

  getClassDetailsByProductId(
    productId: string | number,
    {
      withProduct,
      withCategory,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<ClassDetailsResponseDTO>;

  listClasses(
    filter: ClassDetailsFilter,
    {
      withProduct,
      withCategory,
      includeArchived,
      withLocation,
      withMerchant,
    }: {
      withProduct?: boolean;
      withCategory?: boolean;
      includeArchived?: boolean;
      withLocation?: boolean;
      withMerchant?: boolean;
    },
  ): Promise<PaginatedResponseDTO<ClassDetailsResponseDTO, ProductOrderByKey>>;

  updateClass(
    id: string | number,
    productId: string | number,
    dto: UpdateClassDTO,
  ): Promise<ClassDetailsResponseDTO>;
}
