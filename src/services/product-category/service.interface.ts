import {
  CreateProductCategoryDTO,
  ProductCategoryFilter,
  ProductCategoryResonseDTO,
} from "../../shared/dtos/ProductCategoryDTOs";

export interface IProductCategoryService {
  createProductCategory(
    dto: CreateProductCategoryDTO,
    {
      locationId,
      merchantId,
    }: { locationId: string | number; merchantId: string | number }
  ): Promise<ProductCategoryResonseDTO>;

  getProductCategoryById(
    id: string | number,
    {
      withLocation,
      withMerchant,
    }: { withLocation?: boolean; withMerchant?: boolean }
  ): Promise<ProductCategoryResonseDTO>;

  listProductCategorie(
    filter: ProductCategoryFilter,
    {
      withLocation,
      withMerchant,
    }: {
      withLocation?: boolean;
      withMerchant?: boolean;
    }
  ): Promise<ProductCategoryResonseDTO[]>;

  archiveProductCategory(
    id: string | number
  ): Promise<ProductCategoryResonseDTO>;
}
