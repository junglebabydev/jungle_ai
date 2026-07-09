import { Prisma } from "@prisma/client";

const merchantWithLocations = Prisma.validator<Prisma.MerchantDefaultArgs>()({
  include: {
    locations: true,
  },
});

export type MerchantWithLocations = Prisma.MerchantGetPayload<
  typeof merchantWithLocations
>;

/**
 * A merchant with the relations the search index denormalizes into its
 * document (its locations + product categories), so merchant search can match
 * and filter on what the merchant actually offers — regions, location types,
 * categories — not just its name.
 */
/**
 * The single include the search index denormalizes from. Loaded on create /
 * update / cascade-reindex AND by the reconcile keyset query, so all index
 * write paths produce the same enriched document. Per location it pulls
 * `details.description` (searchable free text shown on the search cards) and
 * the location's own fields (name, region, district, address, tags); plus the
 * merchant's product categories (names + ids).
 *
 * NOTE: only relations whose changes cascade a merchant reindex are denormalized
 * here. Locations (via the location write hooks) and product categories (via the
 * product-category hooks) do; individual products do NOT reindex their parent
 * merchant, so product-level fields (e.g. product tags) are deliberately NOT
 * pulled in — they'd go stale until the periodic reconcile. The doc's `tags`
 * are location tags only. Keep this the ONLY include definition — every indexer
 * imports it so the shape can't drift.
 */
export const MERCHANT_SEARCH_INCLUDE = {
  locations: {
    where: { isArchived: false },
    include: {
      details: { select: { description: true } },
    },
  },
  productCategories: { where: { isArchived: false } },
} satisfies Prisma.MerchantInclude;

export type MerchantWithRelations = Prisma.MerchantGetPayload<{
  include: typeof MERCHANT_SEARCH_INCLUDE;
}>;
