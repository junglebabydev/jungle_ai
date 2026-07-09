import { Prisma } from "@prisma/client";

const productExtended = Prisma.validator<Prisma.ProductDefaultArgs>()({
  include: {
    location: {
      include: {
        merchant: true,
      },
    },
  },
});

export type ProductExtended = Prisma.ProductGetPayload<typeof productExtended>;

/**
 * A product with the relations the search index denormalizes into its document
 * (category + location + the location's merchant + the merchant's non-archived
 * product categories). The merchant categories are folded into the product's
 * searchable text/embedding because products themselves are largely
 * uncategorized in the data, so activity searches lean on the merchant's
 * categorization. Used by the search index hooks and reconcile; kept separate
 * from `ProductExtended` so existing consumers of that type are unaffected.
 */
// The single source of truth for the relations the search index denormalizes
// into a product document. Exported so EVERY path that builds a product doc —
// the reconcile (`findManyKeyset`) and the single-doc reindex hook
// (`findProductByIdExtended`) — uses the exact same shape; otherwise the hook
// would emit docs missing fields the reconcile has, and the index would drift.
export const PRODUCT_SEARCH_INCLUDE = {
  category: true,
  location: {
    include: {
      merchant: {
        include: {
          productCategories: { where: { isArchived: false } },
        },
      },
    },
  },
  // Non-archived camp options drive the denormalized availability timestamp
  // (`latestCampOptionStartAt`) so expired camps can be filtered out at search
  // time, AND (for CAMP products) the price/date/time facets. Only CAMP products
  // have these; the doc builder ignores them for every other type.
  campOptions: { where: { isArchived: false } },
  // Public, non-archived pricings drive `priceFrom` (min non-trial price) and
  // the free-trial flag for CLASS/DROP_IN products.
  pricings: { where: { isArchived: false } },
  // Format + amenity flags: classDetails (drop-in / trial / term-based) and
  // campDetails (meals / transport included).
  classDetails: true,
  campDetails: true,
  // Day-of-week + time-of-day facets. CLASS schedules and DROP_IN schedules
  // carry dayOfWeek + startTime directly; CAMP days are derived from each camp
  // option's date range (camp options are already included above).
  schedules: { where: { isPublished: true } },
  dropInSchedules: { where: { isArchived: false, isActive: true } },
} satisfies Prisma.ProductInclude;

const productWithRelations = Prisma.validator<Prisma.ProductDefaultArgs>()({
  include: PRODUCT_SEARCH_INCLUDE,
});

export type ProductWithRelations = Prisma.ProductGetPayload<
  typeof productWithRelations
>;
