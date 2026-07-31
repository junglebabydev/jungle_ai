import { Merchant } from "@prisma/client";
import prisma from "../../config/prisma";
import { searchClient } from "../../lib/searchClient";
import { ServiceLocator } from "..";
import { IMerchantServiceInternal } from "./service.interafce";
import { MERCHANT_SEARCH_INCLUDE } from "../../shared/types/merchant";

//////////////////////////////
// Internal Service IMPL
//////////////////////////////

async function findMerchantById(
  id: string | number,
): Promise<Merchant | null> {
  return prisma.merchant.findUnique({
    where: { id: Number(id) },
  });
}

/**
 * Refresh a merchant in the search index with its enriched (denormalized)
 * fields. Refetches the merchant + its active locations/categories and upserts
 * the doc. Non-fatal — a search failure must never break the originating write.
 * Call AFTER the child write commits (the location/category cascade hooks).
 */
async function reindexForSearch(id: string | number): Promise<void> {
  // The search service loads the row from the shared database itself; we just
  // tell it which document changed. Fire-and-forget (never throws).
  await searchClient.reindex("merchants", id);
}

/**
 * The curated shop window, in the admin's chosen order. Featuring is a deliberate
 * editorial act, so the only thing that can override it is the merchant being
 * archived — `isActive` tracks a different concern entirely and must not silently
 * veto a pick. An unordered entry sorts last rather than dropping out, so
 * forgetting to set a position never removes a provider either.
 */
async function findFeaturedMerchantIds(): Promise<number[]> {
  const rows = await prisma.merchant.findMany({
    where: { isFeatured: true, isArchived: false },
    orderBy: [{ featuredOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

//////////////////////////////
// Exports
//////////////////////////////

export const MerchantServiceInternal: IMerchantServiceInternal = {
  findMerchantById,
  reindexForSearch,
  findFeaturedMerchantIds,
};
