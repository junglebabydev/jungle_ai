import { Pricing, Prisma } from "@prisma/client";
import { IPricingServiceInternal } from "./service.interface";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";

async function getPricingById(
  id: string | number,
  tx?: Prisma.TransactionClient,
): Promise<Pricing> {
  const db = tx ?? prisma;

  try {
    const pricing = await db.pricing.findUnique({
      where: { id: Number(id) },
    });
    if (!pricing) throw NotFoundError.Pricing;

    return pricing;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPricing(`id: ${id}`);
  }
}

async function findAllById(
  ids: string[] | number[],
  tx?: Prisma.TransactionClient,
): Promise<Pricing[]> {
  const db = tx ?? prisma;
  try {
    return await db.pricing.findMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPricing();
  }
}

export const PricingServiceInternal: IPricingServiceInternal = {
  getPricingById,
  findAllById,
};
