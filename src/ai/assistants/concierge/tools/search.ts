import { z } from "zod";
import { LOCATION_TYPE, PRODUCT_TYPE } from "@prisma/client";
import {
  ACTIVITY_CATEGORIES,
  SEARCH_REGIONS,
} from "../../../../shared/constants";
import { searchClient } from "../../../../lib/searchClient";
import {
  SearchResponseDTO,
  SearchSection,
  StructuredSearchInput,
} from "../../../../shared/dtos/SearchDTOs";
import { ConciergeTool, ConciergeToolContext } from "./types";
import { TRAILS } from "../../../../shared/constants";
import {
  inferExplorerMapTrailsFromText,
  isGenericExplorerMapQuery,
  normalizeExplorerMapTrails,
} from "../../../../shared/trails";
import { LruTtlCache } from "../../../../lib/cache/lruTtlCache";
import {
  namesAnActivity,
  stripOfferingWords,
} from "../../../../utils/searchQueryParser";

/** Top-N results SAMPLED into the model's context per search (kept small to
 *  bound tokens/cost — the model only needs a few to summarize). */
const SEARCH_PAGE_SIZE = Number(process.env.CONCIERGE_SEARCH_PAGE_SIZE || 8);
/** Cards returned to the FE per search (the card grid's page size). Decoupled
 *  from the model sample so the grid can show a full page while the model still
 *  sees only the top SEARCH_PAGE_SIZE. The FE paginates further pages via the
 *  non-LLM POST /concierge/results endpoint. Prod-tunable. */
const RESULTS_PAGE_SIZE = Number(process.env.CONCIERGE_RESULTS_PAGE_SIZE || 20);

// Structured tool: the MODEL does the query understanding — it puts the bare
// activity in `query` and lifts each stated detail into its own typed field. The
// server then GROUNDS every field against the real vocabulary (district/region
// membership, etc.) and drops anything unrecognised, so an invented or misspelled
// value just broadens the search — it can never become a wrong filter. This is
// the "use the AI model, don't hardcode" split: the LLM normalises ("tampins" →
// "Tampines", "orchards" → "Orchard"); the server validates membership.
const SearchToolInput = z.object({
  query: z
    .string()
    .describe(
      "The ACTIVITY ('swimming', 'piano', 'coding') OR a PROVIDER/BRAND NAME the parent mentioned — the search matches provider names too, so pass a name through as-is (don't shorten it). Correct obvious misspellings to the intended activity ('swiming' → 'swimming'). Strip everything else: NO age, area, price, day or time words, NO filler ('best', 'good', 'classes', 'camps', 'for my kid'), and NO circumstance the parent is describing ('rainy days', 'school holidays', 'the weekend', 'a birthday present', 'somewhere fun') — a circumstance is not an activity, and searching those words matches almost nothing. When the message names no activity and no provider, pass \"\" and let the filters carry the search: that is the RIGHT answer for an ask like 'indoor activities for rainy days' (→ \"\" with locationType INDOOR), not a fallback.",
    ),
  age: z
    .number()
    .int()
    .optional()
    .describe("Child's age in YEARS if stated ('for my 5 year old' → 5)."),
  district: z
    .string()
    .optional()
    .describe(
      "HARD area filter — restricts results to this EXACT Singapore planning area. Use whenever the parent names a place WITHOUT saying 'near' ('in Tampines', 'at Orchard', 'Tampines classes', or just 'Tampines'). This is the DEFAULT for any area mention. Give the real, correctly-spelled name and FIX typos ('tampins' → 'Tampines'). Do NOT use for 'near' / 'around' (that's nearDistrict).",
    ),
  nearDistrict: z
    .string()
    .optional()
    .describe(
      "Proximity RANKING only — does NOT restrict the area (results can be anywhere, just sorted by distance). Use ONLY when the parent EXPLICITLY says 'near' / 'around' / 'close to' / 'nearby'. For 'in' / 'at' / a bare area name, use `district` instead.",
    ),
  excludeDistrict: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Area(s) to leave OUT, when the parent asks for anything EXCEPT somewhere ('not in Holland Village', 'anywhere but Tampines'). Put the excluded area HERE and leave `district` unset — setting it as `district` returns exactly what they ruled out.",
    ),
  region: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      // Canonical region chips (server grounds them; "Anywhere" = no preference).
      // ONE or SEVERAL when the parent names more than one broad area.
      `Broad Singapore region(s) if named instead of a specific area — one, or an array for several. Each one of: ${SEARCH_REGIONS.join(
        ", ",
      )}. Use "Anywhere" (or omit) for no area preference.`,
    ),
  category: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      // Canonical activity-category chips; the server grounds them (topic
      // categories filter by the provider's category; Camps/Birthdays/Indoor
      // play/Outdoor map to the right type). Use ONLY when the parent's interest
      // clearly maps to one or more; otherwise omit (the activity in `query`
      // already covers it). EXACT labels.
      `Activity category/categories if they clearly apply — one, or an array for several (e.g. ["Swim","Dance"]). Each one of: ${ACTIVITY_CATEGORIES.join(
        ", ",
      )}.`,
    ),
  trail: z
    .union([z.enum(TRAILS), z.array(z.enum(TRAILS)).max(TRAILS.length)])
    .optional()
    .describe(
      "Internal interest grouping. The server derives this from the parent's own words and overrides whatever you send, so normally leave it unset. Never name it, its values, or any grouping of activities to the parent.",
    ),
  locationType: z
    .string()
    .optional()
    .describe(
      // INDOOR / OUTDOOR from LOCATION_TYPE (BOTH is a merchantLocation capability, not a
      // user intent, so it's not offered).
      `One of ${[LOCATION_TYPE.INDOOR, LOCATION_TYPE.OUTDOOR].join(
        " or ",
      )} if the parent specified it.`,
    ),
  maxPrice: z
    .number()
    .optional()
    .describe("Budget ceiling in SGD if a number is given ('under $200' → 200)."),
  cheap: z
    .boolean()
    .optional()
    .describe(
      "True when they want the cheapest / most affordable but give no number.",
    ),
  freeTrial: z
    .boolean()
    .optional()
    .describe("True for 'free trial' / 'trial class'."),
  dropIn: z.boolean().optional().describe("True for 'drop-in' (pay per session)."),
  termBased: z.boolean().optional().describe("True for 'term-based' / 'termly'."),
  meals: z.boolean().optional().describe("True when meals/lunch should be included."),
  transport: z
    .boolean()
    .optional()
    .describe("True when transport/bus should be included."),
  daysOfWeek: z
    .array(z.number().int())
    .optional()
    .describe(
      "Days as ints (Sun=0 … Sat=6): 'weekend' → [0,6], 'weekday' → [1,2,3,4,5], 'Monday' → [1].",
    ),
  timeOfDay: z
    .string()
    .optional()
    .describe("'morning', 'afternoon' or 'evening' if stated."),
  sort: z
    .enum(["relevance", "rating", "priceAsc"])
    .optional()
    .describe(
      "Set ONLY when the parent asks for an order: 'rating' for best/highest rated/most popular, 'priceAsc' for cheapest first. Leave unset otherwise — results are ordered by how well they match, which is what a normal ask wants. Setting this is what earns you the right to call something top rated or cheapest.",
    ),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Result page (default 1) — use to fetch MORE of the same search."),
});

/**
 * Identical searches are common — across turns of one chat, and across parents asking
 * the same popular thing — and each one otherwise costs a full round-trip plus the
 * hydration of a page of cards. The TTL is deliberately short: the catalogue is what
 * a parent is being shown, so a newly published activity should appear within about a
 * minute, not whenever an entry happens to fall out. Single-flight loading also
 * collapses the stampede when several parents search the same thing at once.
 */
const searchResponseCache = new LruTtlCache<SearchResponseDTO>({
  max: Number(process.env.CONCIERGE_SEARCH_CACHE_MAX || 200),
  ttlMs: Number(process.env.CONCIERGE_SEARCH_CACHE_TTL_MS || 60_000),
});

/** Test-only: drop the search cache so cases can't bleed into each other. */
export function _resetSearchCache(): void {
  searchResponseCache.clear();
}

/**
 * A stable key for one grounded search. Keys are sorted so two inputs that differ
 * only in property order share an entry, and it is built from the input AFTER
 * server-side grounding — the scope, tab and filter pins are all in there, so a
 * venue chat can never be served another venue's results.
 */
function searchCacheKey(input: StructuredSearchInput): string {
  return JSON.stringify(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Compact a full search response into the small projection the MODEL sees (names
 * + key facts only) — the full results go to the frontend separately, so we keep
 * the LLM context (and cost) lean.
 *
 * `detailed` (the merchant-location chat): there are only a handful of results
 * for one venue and the parent wants specifics about what's on offer, so we also
 * feed the model each offering's short description + highlights + tags (already
 * loaded — we were just dropping them). The global discovery feed stays lean.
 * NOTE: the projection carries a STARTING price (`priceFrom`) and nothing about what
 * that price covers. Schedule, camp dates, remaining spots and the exact pricing
 * breakdown still need `get_activity_details` (scoped chat only).
 */
export function compactResults(
  res: SearchResponseDTO,
  { detailed = false }: { detailed?: boolean } = {},
): unknown {
  const products = res.products.data.slice(0, SEARCH_PAGE_SIZE).map((p, index) => ({
    // Position in THIS turn's list, 1-based. A parent says "the second one", and
    // without it two products sharing a name are indistinguishable rows to the model.
    // A position rather than a database id, so the existing id redaction is untouched
    // and nothing internal can leak through it.
    ref: index + 1,
    name: p.name,
    type: p.productType,
    ages: `${p.ageMin}-${p.ageMax}`,
    area: p.location?.sgDistrict ?? undefined,
    provider: p.merchant?.name ?? undefined,
    // The VENUE's Google Maps reputation, not the activity's. `gMapRating` lives on
    // Location and there is no rating on Product, so every activity at one address
    // carries this same number — it cannot tell two camps at the same venue apart.
    // Named `venueRating` because the model reads the field name: called `rating` and
    // sat beside the activity's own name and ages, it got attributed to the activity.
    venueRating: p.location?.gMapRating ?? undefined,
    venueReviews: p.location?.reviewCount ?? undefined,
    // The lowest price a parent can pay, straight from the search index — the same
    // figure the budget filter ranked on. Omitted when the product has no usable
    // price; that is "not listed", never free, and the reply rules say so. No unit
    // travels with it yet, which is why only "from $X" phrasing is permitted.
    priceFrom: p.priceFrom ?? undefined,
    // The unit and the caveats travel WITH the figure. Alone, a number invites being
    // read as the total, as generally available, and as comparable to the next row's
    // — and it is none of those.
    priceType: p.priceType ?? undefined,
    priceIsRange: p.priceIsRange ? true : undefined,
    isFree: p.isFree ? true : undefined,
    priceQualified: p.priceQualified ? true : undefined,
    hasMinimumSpend: p.hasMinimumSpend ? true : undefined,
    // Only present when the search actually ranked by distance. Absent means nothing
    // was measured — which is the difference between describing proximity and
    // guessing at it.
    distanceKm: p.distanceKm ?? undefined,
    ...(detailed && {
      about: p.description ? p.description.slice(0, 200) : undefined,
      highlights: p.highlights?.length ? p.highlights.slice(0, 4) : undefined,
      tags: p.tags?.length ? p.tags.slice(0, 6) : undefined,
    }),
  }));
  const providers = res.merchants.data
    .slice(0, 6)
    .map((m, index) => ({ ref: index + 1, name: m.name }));
  // The broadening ladder relaxes the parent's ask to keep the grid from being empty.
  // The frontend was told; the model never was, so it described a relaxed set in its
  // own words as though it had answered the question. Passing both through is what
  // lets the reply say which constraint was dropped instead of quietly ignoring it.
  // Packages (multi-session passes / memberships from PackageTemplate) are their own
  // search section, present ONLY when the FE tab requested them (include=packages).
  // When present, surface them to the model so it can name real package/bundle deals
  // instead of replying "I didn't find any packages" — the cards envelope already
  // carried them; this closes the gap where the model never saw the packages the
  // search returned. Kept lean (name only, top 6); price/terms come from the page.
  const packages = res.packages
    ? res.packages.data.slice(0, 6).map((p) => ({ name: p.name }))
    : undefined;
  return {
    productsTotal: res.products.total,
    providersTotal: res.merchants.total,
    ...(res.packages ? { packagesTotal: res.packages.total } : {}),
    ...(res.broadened ? { broadened: true, relaxed: res.relaxed ?? [] } : {}),
    products,
    providers,
    ...(packages ? { packages } : {}),
  };
}

/** The words a parent uses to name the KIND of thing they want, and the product
 *  type that answers each. Drop-in is tested first so its hyphen/space spellings
 *  can't be shadowed by a looser pattern. A ticket, and a pass qualified as a
 *  single visit, are how a drop-in is sold — asking for one is asking for a
 *  drop-in. "Activity" belongs here too: it is the catalogue's word for a
 *  turn-up-and-play session, so an ask for activities is an ask for drop-ins.
 *  A bare "pass" is deliberately NOT here: most passes in the catalogue are
 *  class bundles ("Mastery Pass", "10-Class Pass"), so it would point the wrong
 *  way. */
const OFFERING_WORD_TYPES: ReadonlyArray<readonly [RegExp, PRODUCT_TYPE]> = [
  [
    /\b(?:drop[\s-]?ins?|tickets?|activit(?:y|ies)|(?:day|entry|visit|play|single)[\s-]?passe?s?)\b/i,
    PRODUCT_TYPE.DROP_IN,
  ],
  [/\bcamps?\b/i, PRODUCT_TYPE.CAMP],
  [/\b(?:classes|class|lessons?|courses?)\b/i, PRODUCT_TYPE.CLASS],
  [/\b(?:birthdays?|parties|party)\b/i, PRODUCT_TYPE.BIRTHDAY],
  [/\bevents?\b/i, PRODUCT_TYPE.EVENT],
];

/**
 * The product type the parent named in their own words ("holiday camp for a 5
 * year old"). Read from the parent's message rather than the model's search term,
 * because that term is the ACTIVITY ("swimming") with the kind of offering
 * already stripped out of it. Returns null when they named none or more than one,
 * so an open-ended ask still gets the full mixed grid.
 */
/**
 * True when the parent asked about buying a PACKAGE — a prepaid plan, membership
 * or bundle — rather than about something to do. Packages answer "what should I
 * buy", activities answer "what can we do", so the two asks want different rows.
 */
export function namedPackages(userMessage: string): boolean {
  return /\b(?:packages?|memberships?|bundles?)\b/i.test(userMessage);
}

export function namedProductType(userMessage: string): PRODUCT_TYPE | null {
  const named = new Set<PRODUCT_TYPE>();
  for (const [pattern, productType] of OFFERING_WORD_TYPES) {
    if (pattern.test(userMessage)) named.add(productType);
  }
  return named.size === 1 ? [...named][0] : null;
}

/**
 * The sections an open browse should return. A package is a prepaid plan, not an
 * outing — a parent asking what to do on a rainy day is not asking to buy a
 * membership, and package rows crowd out the activities that answer them. So
 * packages stay out unless the parent asked for one, or is on the packages tab
 * (where they are the entire point).
 */
function browseSections(
  ctx: ConciergeToolContext,
): SearchSection[] | undefined {
  const sections = ctx.sections;
  if (!sections?.length) return sections;
  const isPackagesTab = sections.length === 1 && sections[0] === "packages";
  if (isPackagesTab || ctx.askedForPackages) return sections;
  const withoutPackages = sections.filter((section) => section !== "packages");
  return withoutPackages.length ? withoutPackages : sections;
}

async function runSearch(
  args: unknown,
  ctx: ConciergeToolContext,
): Promise<{
  response: SearchResponseDTO;
  input: StructuredSearchInput;
  modelCategories?: string | string[];
}> {
  // Coerce the tool args to the typed shape; all fields are optional, so a
  // malformed call degrades to an empty (wildcard) browse rather than throwing.
  // The service GROUNDS every filter against the real vocabulary before use.
  const parsed = SearchToolInput.safeParse(args);
  const a = parsed.success ? parsed.data : { query: "" };
  const explicitTrails = normalizeExplorerMapTrails(a.trail);
  const inferredTrails = inferExplorerMapTrailsFromText(ctx.userMessage);
  const modelQuery = a.query ?? "";
  // FE-supplied filters (parity with /concierge/results). Each present value PINS
  // over the model's inference for that field; absent ones fall back to the model.
  const pf = ctx.pinnedFilters ?? {};
  const pin = <T>(pinned: T | undefined, model: T): T =>
    pinned !== undefined ? pinned : model;
  // When the parent names the kind of thing they want, that IS the question:
  // answer it with those activities alone. A provider or a package is not a camp,
  // and a generic word like "camp" otherwise keyword-matches provider NAMES, so
  // the grid fills with rows that can't answer the ask. An active type tab
  // already says the same thing, so it wins; a venue chat is products-only anyway.
  const askedForType =
    ctx.scoped || ctx.productTypes?.length ? null : (ctx.askedProductType ?? null);
  // The established activity is applied SERVER-SIDE when this turn's query names none
  // of its own. Delivering it only as prose in the system prompt made it advisory, and
  // the model dropped it on roughly half of bare refinements — "any in the east?" came
  // back as an unfiltered browse of the East with the parent asked afresh what their
  // child likes. It is a fallback, never an override: a query that names a real
  // activity is the parent changing subject, and wins.
  const carried = ctx.scoped ? null : (ctx.carriedActivity ?? null);
  const chosenQuery = namesAnActivity(modelQuery) ? modelQuery : (carried ?? modelQuery);
  // Drop the offering word the model tends to echo back from the active tab. Browsing
  // the Classes tab and typing an area produced query="classes", which then KEYWORD-
  // matched the literal word in product text and cut the result set by ~89% (421 → 47
  // for one district) — a filter the parent never asked for. An offering word alone
  // leaves "", which the search treats as a browse; the type scope is already pinned
  // separately. This safety net existed and was never wired up.
  const groundedQuery = stripOfferingWords(chosenQuery);

  const input: StructuredSearchInput = {
    // The parent's message, untouched. The `query` above has been stripped to a bare
    // activity term for keyword matching; the words that carry their actual intent
    // only survive here, and the semantic half ranks on them.
    rawQuery: ctx.userMessage || undefined,
    query:
      inferredTrails.length && isGenericExplorerMapQuery(groundedQuery)
        ? ""
        : groundedQuery,
    // SCOPE + section binding are pinned SERVER-SIDE from `ctx` (the verified
    // request), never from the model — so the agent can't search outside the
    // tab the parent is viewing nor widen out of the pinned venue.
    merchantId: ctx.scope?.merchantId,
    locationId: ctx.scope?.locationId,
    merchantIds: ctx.merchantIds,
    age: pin(pf.age, a.age),
    // A pinned family of areas (resolved deterministically from the parent's own
    // word) wins over the model's single guess — otherwise "bukit" is answered
    // from whichever one area the model happened to pick.
    district: pin(pf.district, a.district),
    nearDistrict: pin(pf.nearDistrict, a.nearDistrict),
    // Server-grounded like every other area field, so an unrecognised name widens
    // the search instead of excluding nothing (or the wrong thing).
    excludeDistrict: a.excludeDistrict,
    // FE-pinned chips win over the model's inferred values.
    region: ctx.region ?? a.region,
    category: ctx.category ?? a.category,
    // A pinned trail wins; else clear language in the message outranks model args.
    trail:
      pf.trail !== undefined
        ? pf.trail
        : inferredTrails.length
          ? inferredTrails
          : explicitTrails,
    locationType: pin(pf.locationType, a.locationType),
    maxPrice: ctx.maxPrice ?? a.maxPrice,
    cheap: pin(pf.cheap, a.cheap),
    freeTrial: pin(pf.freeTrial, a.freeTrial),
    dropIn: pin(pf.dropIn, a.dropIn),
    termBased: pin(pf.termBased, a.termBased),
    meals: pin(pf.meals, a.meals),
    transport: pin(pf.transport, a.transport),
    daysOfWeek: pin(pf.daysOfWeek, a.daysOfWeek),
    timeOfDay: pin(pf.timeOfDay, a.timeOfDay),
    sort: a.sort,
    page: a.page,
    pageSize: RESULTS_PAGE_SIZE,
    // A merchantLocation chat is products-only; otherwise honour the FE tab —
    // except when the parent named the kind of thing they want, which answers the
    // question more precisely than the tab does (see `askedForType`).
    sections:
      ctx.scoped || askedForType ? ["products"] : browseSections(ctx),
    // Product-type scope: the tab's pin (include=CAMP/CLASS/…) when there is one,
    // otherwise the type the parent named. Server-set either way; the model can't
    // widen it.
    productTypes: ctx.scoped
      ? undefined
      : askedForType
        ? [askedForType]
        : ctx.productTypes,
  };
  const response = await searchResponseCache.getOrLoad(searchCacheKey(input), () =>
    searchClient.search(input),
  );
  return {
    response,
    input,
    modelCategories: a.category,
  };
}

/**
 * `search_activities` — the public catalogue search. Always offered (both the
 * global discovery chat and the per-venue chat). Returns the full search payload
 * as FE `cards`, and a lean projection (`detailed` in scoped chats) to the model.
 */
export const searchActivitiesTool: ConciergeTool = {
  name: "search_activities",
  scopedOnly: false,
  definition: {
    type: "function",
    function: {
      name: "search_activities",
      description:
        "Search the PUBLIC catalogue of kids' activities and providers. For a named activity/provider put it in `query`; use query:\"\" when no activity was named. Lift age, area, budget, day, time and format into typed fields. Use `district` for 'in/at' and `nearDistrict` only for 'near/around'.",
      parameters: z.toJSONSchema(SearchToolInput),
    },
  },
  run: async (args, ctx) => {
    const { response } = await runSearch(args, ctx);
    // The complementary-trail ("new ground") search is PARKED, not deleted. Its only
    // consumer was the model projection, which went with the parent-facing framework:
    // running it now would spend a whole search round-trip on a result nobody reads.
    // `chooseComplementaryExplorerMapTrail` and the trail helpers are untouched, so
    // restoring it is one block here plus one field in the projection.
    return {
      forModel: compactResults(response, { detailed: ctx.scoped }),
      cards: response,
    };
  },
};
