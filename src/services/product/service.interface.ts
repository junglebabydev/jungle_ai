import { Prisma, Product } from "@prisma/client";
import {
  CreateProductDTO,
  ProductFilter,
  ProductResponseDTO,
  UpdateProductDTO,
} from "../../shared/dtos/ProductDTOs";
import { ProductWithRelations } from "../../shared/types/product";

export interface IProductServiceInternal {
  createProduct(
    locationId: string | number,
    dto: CreateProductDTO,
    tx?: Prisma.TransactionClient
  ): Promise<Product>;

  findProductById(id: string | number): Promise<Product | null>;

  /** Product + category + location + merchant — the shape the search index needs. */
  findProductByIdExtended(
    id: string | number
  ): Promise<ProductWithRelations | null>;

  /**
   * Refresh this product in its search collection (routed by productType).
   * Fire-and-forget friendly: non-fatal, swallows + logs. No-op for product
   * types that aren't indexed yet. Call AFTER the owning write transaction
   * commits — never inside it.
   */
  reindexForSearch(id: string | number): Promise<void>;

  /**
   * Re-index every product at a location after the location's searchable fields
   * (sgDistrict/sgRegion/name/locationType/tags) change — they're denormalized
   * into each product's search doc. Fire-and-forget friendly: non-fatal,
   * swallows + logs. Call AFTER the owning write transaction commits.
   */
  reindexProductsForLocation(locationId: string | number): Promise<void>;
  reindexProductsForMerchant(merchantId: string | number): Promise<void>;

  getProductById(
    id: string | number,
    {
      withCategory,
      withLocation,
    }: { withCategory?: boolean; withLocation?: boolean },
    tx?: Prisma.TransactionClient
  ): Promise<Product>;

  updateProduct(
    id: string | number,
    dto: UpdateProductDTO,
    tx?: Prisma.TransactionClient
  ): Promise<Product>;

  updateStripePriceId(
    id: string | number,
    stripePriceId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Product>;
}

export interface IProductService {
  getProductById(
    id: string | number,
    {
      withCategory,
      withLocation,
    }: { withCategory?: boolean; withLocation?: boolean }
  ): Promise<ProductResponseDTO>;

  listProducts(
    filter: ProductFilter,
    {
      withCategory,
      withLocation,
    }: {
      withCategory?: boolean;
      withLocation?: boolean;
    }
  ): Promise<ProductResponseDTO[]>;

  publishProduct(id: string | number): Promise<ProductResponseDTO>;

  archiveProduct(id: string | number): Promise<ProductResponseDTO>;

  updateProduct(
    id: string | number,
    dto: UpdateProductDTO
  ): Promise<ProductResponseDTO>;

  updateProduct(
    id: string | number,
    dto: UpdateProductDTO
  ): Promise<ProductResponseDTO>;
}
