import { PRICE_TYPE, PRODUCT_TYPE } from "@prisma/client";

/**
 * Whether a product is actually findable and bookable, not merely saved.
 *
 * The agent's existing measure is tool discipline — did it call the right tool, did
 * it respect the confirm gate. That says whether it is SAFE, not whether the listing
 * it produced is any use. A product with a two-line description and no tags is
 * invisible to search; one with no price cannot be judged against a budget; a party
 * with no group size has no computable cost. Each gap below is a specific thing a
 * parent is then told the platform does not know.
 *
 * Weights drive what the agent volunteers to fix: `critical` before the merchant
 * moves on, `high` offered in passing, `medium` only if asked.
 */
export type CompletenessWeight = "critical" | "high" | "medium";

export type CompletenessGap = {
  field: string;
  weight: CompletenessWeight;
  /** Plain language the agent can say aloud — never a field name on its own. */
  says: string;
};

export type Completeness = {
  /** Fraction of the checks that PASSED, over the ones that could be judged. */
  score: number;
  gaps: CompletenessGap[];
  /** How many checks were actually judged, so a partial read is never read as a pass. */
  checked: number;
};

/** A description shorter than this gives search almost nothing to match on. */
const MIN_DESCRIPTION_CHARS = Number(
  process.env.MERCHANT_MIN_DESCRIPTION_CHARS || 200,
);

/**
 * What was loaded alongside the product. Each is optional because callers differ in
 * what they read, and a check is SKIPPED rather than failed when its data is absent —
 * reporting a missing price because nobody looked would send the agent chasing a gap
 * that is not there.
 */
/**
 * The pre-booking answers every product type carries on its own details row. Shared
 * so the checks below don't have to be repeated per type.
 */
export type PreBookingDetails = {
  cancellationPolicy?: string | null;
  requiresPackage?: boolean | null;
};

export type CompletenessInput = {
  product: {
    productType: PRODUCT_TYPE;
    description?: string | null;
    tags?: string[] | null;
    highlights?: string[] | null;
    categoryId?: number | null;
    bookingRequired?: boolean | null;
  };
  pricing?: Array<{ priceType?: PRICE_TYPE | string | null; isPublic?: boolean }>;
  schedules?: unknown[];
  campOptions?: unknown[];
  classDetails?: PreBookingDetails | null;
  campDetails?: PreBookingDetails | null;
  birthdayDetails?:
    | ({ minKids?: number | null; whatsIncluded?: string | null } & PreBookingDetails)
    | null;
  dropInDetails?: PreBookingDetails | null;
};

/**
 * Score one product and name what is missing, judging only what the caller loaded.
 * Returns the gaps in the order the agent should raise them.
 */
export function productCompleteness(input: CompletenessInput): Completeness {
  const { product } = input;
  const gaps: CompletenessGap[] = [];
  let checked = 0;
  let passed = 0;

  const check = (
    condition: boolean,
    field: string,
    weight: CompletenessWeight,
    says: string,
  ) => {
    checked += 1;
    if (condition) passed += 1;
    else gaps.push({ field, weight, says });
  };

  // `description` is non-nullable in the schema, so the question is length, never
  // presence — a saved product always has one, it is just often too thin to match.
  check(
    (product.description ?? "").trim().length >= MIN_DESCRIPTION_CHARS,
    "description",
    "high",
    "the description is short, so parents searching in their own words are unlikely to find it",
  );
  // Postgres arrays: empty, never null.
  check(
    (product.tags ?? []).length > 0,
    "tags",
    "high",
    "there are no tags, which is most of how search matches a parent's phrasing",
  );
  check(
    (product.highlights ?? []).length > 0,
    "highlights",
    "medium",
    "there are no highlights, so the listing has nothing to show at a glance",
  );
  check(
    product.categoryId != null,
    "category",
    "high",
    "no category is set, so it will be missed by anyone browsing that kind of activity",
  );

  if (input.pricing) {
    const publicRows = input.pricing.filter((row) => row.isPublic !== false);
    check(
      publicRows.length > 0,
      "pricing",
      "critical",
      "there is no public price, so it cannot be shown to a parent with a budget",
    );
    // A row with no unit is worse than no row: the figure reaches parents meaning
    // nothing in particular.
    check(
      publicRows.every((row) => !!row.priceType),
      "priceType",
      "critical",
      "a price is missing its type, so nobody can tell what the amount covers",
    );
  }

  if (input.schedules || input.campOptions) {
    const bookable =
      (input.schedules ?? []).length > 0 || (input.campOptions ?? []).length > 0;
    check(
      bookable,
      "schedule",
      "high",
      "there are no dates or sessions, so there is nothing for a parent to book",
    );
  }

  if (product.productType === PRODUCT_TYPE.BIRTHDAY && input.birthdayDetails) {
    // Without the minimum, the per-child price is the only number available, and it
    // is not what the party costs.
    check(
      input.birthdayDetails.minKids != null,
      "minKids",
      "critical",
      "the minimum group size is missing, so the real cost of the party cannot be worked out",
    );
    check(
      !!input.birthdayDetails.whatsIncluded,
      "whatsIncluded",
      "high",
      "what the package includes is not listed, which is the first thing a parent asks",
    );
  }

  // Whether a parent must book ahead is asked of every product type, and it lives on
  // the product itself, so it is judged whenever a product was loaded at all.
  check(
    product.bookingRequired != null,
    "bookingRequired",
    "medium",
    "nobody has said whether parents need to book ahead or can just turn up",
  );

  // The remaining pre-booking answers live on the type's own details row, so they are
  // judged only when the caller loaded it — same skip-don't-fail rule as pricing.
  const details =
    input.classDetails ??
    input.campDetails ??
    input.birthdayDetails ??
    input.dropInDetails;

  if (details) {
    check(
      !!details.cancellationPolicy,
      "cancellationPolicy",
      "high",
      "there is no cancellation policy, so that question has to go unanswered",
    );
    check(
      details.requiresPackage != null,
      "requiresPackage",
      "medium",
      "nobody has said whether a package must be bought, or whether parents can pay per session",
    );
  }

  const order: CompletenessWeight[] = ["critical", "high", "medium"];
  gaps.sort((a, b) => order.indexOf(a.weight) - order.indexOf(b.weight));

  return { score: checked ? passed / checked : 1, gaps, checked };
}
