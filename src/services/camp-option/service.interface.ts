import {
  CampOptionFilter,
  CampOptionResponseDTO,
  CreateCampOptionDTO,
  UpdateCampOptionDTO,
} from "../../shared/dtos/CampOptionDTOs";
import { PaginatedResponseDTO } from "../../shared/dtos/PaginationDTO";
import { ProductOrderByKey } from "../../shared/dtos/ProductDTOs";

export interface ICampOptionService {
  createCampOption(dto: CreateCampOptionDTO): Promise<CampOptionResponseDTO>;

  getCampOptionById(
    id: string | number,
    { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean },
  ): Promise<CampOptionResponseDTO>;

  getCampOptionByProduct(
    productId: string | number,
    { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean },
  ): Promise<CampOptionResponseDTO>;

  listCampOptions(
    filter: CampOptionFilter,
    { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean },
  ): Promise<PaginatedResponseDTO<CampOptionResponseDTO, ProductOrderByKey>>;

  updateCampOption(
    id: string | number,
    productId: string | number,
    dto: UpdateCampOptionDTO,
  ): Promise<CampOptionResponseDTO>;
}
