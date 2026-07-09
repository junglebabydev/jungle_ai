import { Pricing, Prisma } from "@prisma/client";
import {
  CreatePricingDTO,
  PricingResponseDTO,
  UpdatePricingDTO,
} from "../../shared/dtos/PricingDTOs";

export interface IPricingServiceInternal {
  getPricingById(
    id: string | number,
    tx?: Prisma.TransactionClient,
  ): Promise<Pricing>;

  findAllById(
    ids: string[] | number[],
    tx?: Prisma.TransactionClient,
  ): Promise<Pricing[]>;
}

export interface IPricingService {
  createPricing(
    productId: string | number,
    dto: CreatePricingDTO,
    tx?: Prisma.TransactionClient,
  ): Promise<PricingResponseDTO>;

  updatePricing(
    pricingId: number,
    dto: UpdatePricingDTO,
    scope: { productId: number; locationId: number },
  ): Promise<PricingResponseDTO>;

  getPricingById(
    id: string | number,
    { withProduct }: { withProduct?: boolean },
  ): Promise<PricingResponseDTO>;

  listPricingByProduct(
    productId: string | number,
    {
      withProduct,
      onlyPublic,
    }: { withProduct?: boolean; onlyPublic?: boolean },
  ): Promise<PricingResponseDTO[]>;
}
