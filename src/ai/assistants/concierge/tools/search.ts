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
  chooseComplementaryExplorerMapTrail,
  deriveExplorerMapTrails,
  inferActivityCategoriesFromText,
  inferExplorerMapTrailsFromText,
  isGenericExplorerMapQuery,
  normalizeExplorerMapTrails,
} from "../../../../shared/trails";

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
      "REQUIRED whenever the parent expresses a developmental goal rather than a named activity. Map movement/running/climbing/'body stuff' → Physical; curiosity/building/how-things-work → Cognitive; stories/art/music/performance/expression → Creative; confidence with others/friends/teamwork/'social' → Social. It matches activities where the trail is primary OR 'also builds'. May be one trail or several. Do not infer a deficiency or score the child.",
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
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Result page (default 1) — use to fetch MORE of the same search."),
});

/**
 * Compact a full search response into the small projection the MODEL sees (names
 * + key facts only) — the full results go to the frontend separately, so we keep
 * the LLM context (and cost) lean.
 *
 * `detailed` (the merchant-location chat): there are only a handful of results
 * for one venue and the parent wants specifics about what's on offer, so we also
 * feed the model each offering's short description + highlights + tags (already
 * loaded — we were just dropping them). The global discovery feed stays lean.
 * NOTE: price / schedule / camp dates are NOT in the search payload — answering
 * those needs the `get_activity_details` tool (scoped chat only), not this
 * projection.
 */
function compactResults(
  res: SearchResponseDTO,
  { detailed = false }: { detailed?: boolean } = {},
): unknown {
  const products = res.products.data.slice(0, SEARCH_PAGE_SIZE).map((p) => ({
    name: p.name,
    type: p.productType,
    ages: `${p.ageMin}-${p.ageMax}`,
    area: p.location?.sgDistrict ?? undefined,
    provider: p.merchant?.name ?? undefined,
    // Google Maps reputation, so the model can mention/compare how well-rated a
    // provider is across results. Omitted when the location has no rating.
    rating: p.location?.gMapRating ?? undefined,
    reviews: p.location?.reviewCount ?? undefined,
    ...(detailed && {
      about: p.description ? p.description.slice(0, 200) : undefined,
      highlights: p.highlights?.length ? p.highlights.slice(0, 4) : undefined,
      tags: p.tags?.length ? p.tags.slice(0, 6) : undefined,
    }),
  }));
  const providers = res.merchants.data.slice(0, 6).map((m) => ({ name: m.name }));
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
    products,
    providers,
    ...(packages ? { packages } : {}),
  };
}

/** The words a parent uses to name the KIND of thing they want, and the product
 *  type that answers each. Drop-in is tested first so its hyphen/space spellings
 *  can't be shadowed by a looser pattern. A ticket, and a pass qualified as a
 *  single visit, are how a drop-in is sold — asking for one is asking for a
 *  drop-in. A bare "pass" is deliberately NOT here: most passes in the catalogue
 *  are class bundles ("Mastery Pass", "10-Class Pass"), so it would point the
 *  wrong way. */
const OFFERING_WORD_TYPES: ReadonlyArray<readonly [RegExp, PRODUCT_TYPE]> = [
  [
    /\b(?:drop[\s-]?ins?|tickets?|(?:day|entry|visit|play|single)[\s-]?passe?s?)\b/i,
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
  const input: StructuredSearchInput = {
    query:
      inferredTrails.length && isGenericExplorerMapQuery(modelQuery)
        ? ""
        : modelQuery,
    // SCOPE + section binding are pinned SERVER-SIDE from `ctx` (the verified
    // request), never from the model — so the agent can't search outside the
    // tab the parent is viewing nor widen out of the pinned venue.
    merchantId: ctx.scope?.merchantId,
    locationId: ctx.scope?.locationId,
    age: pin(pf.age, a.age),
    district: pin(pf.district, a.district),
    nearDistrict: pin(pf.nearDistrict, a.nearDistrict),
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
  const response = await searchClient.search(input);
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
        "Search the PUBLIC catalogue of kids' activities and providers. For a named activity/provider put it in `query`. For a developmental goal, set `trail`: movement=Physical, curiosity=Cognitive, expression=Creative, people/teamwork=Social; use query:\"\" when no activity was named. Lift age, area, budget, day, time and format into typed fields. Use `district` for 'in/at' and `nearDistrict` only for 'near/around'. A categorized activity search automatically includes one grounded whole-development complement; do not call the tool again just to build a kit.",
      parameters: z.toJSONSchema(SearchToolInput),
    },
  },
  run: async (args, ctx) => {
    const { response, input, modelCategories } = await runSearch(args, ctx);
    const categories =
      modelCategories == null
        ? []
        : Array.isArray(modelCategories)
          ? modelCategories
          : [modelCategories];
    const returnedCategories = response.products.data.map(
      (product) => product.category?.name,
    );
    const inferredCategories = inferActivityCategoriesFromText(
      `${input.query} ${ctx.userMessage}`,
    );
    const represented = deriveExplorerMapTrails([
      ...returnedCategories,
      ...categories,
      ...inferredCategories,
    ]);
    const complementaryTrail = chooseComplementaryExplorerMapTrail(
      represented.trails,
    );

    // Offer the whole-development complement on any activity/trail search so the
    // model CAN suggest a different-trail "new ground" (e.g. sport → also cognitive).
    // The PROMPT decides when to actually use it: it's for exploratory / "what to
    // try / development plan" moments, NOT for a pure price/area/age refinement
    // ("cheaper", "any others") — those keep the same activity. Skipped for provider
    // lookups, venue chats, and searches pinned to an explicit FE category chip.
    const shouldBuildKit =
      !ctx.scoped &&
      ctx.category == null &&
      input.query.trim().length > 0 &&
      represented.trails.length > 0 &&
      complementaryTrail != null;

    let complement: SearchResponseDTO | undefined;
    if (shouldBuildKit) {
      try {
        // Small page size — we only need a few results for the LLM to mention.
        complement = await searchClient.search({
          ...input,
          query: "",
          category: undefined,
          trail: complementaryTrail,
          page: 1,
          pageSize: 5,
        });
      } catch (error) {
        // The kit is optional enrichment. A failure must never hide the main
        // activity results the parent asked for.
        console.warn("[concierge] complementary trail search unavailable:", error);
      }
    }

    const mainForModel = compactResults(response, { detailed: ctx.scoped });
    const complementForModel =
      complement &&
      (complement.products.total > 0 || complement.merchants.total > 0)
        ? {
            trail: complementaryTrail,
            usage:
              "Optional new ground. Mention only after the requested activity; never present it as an equal replacement.",
            results: compactResults(complement),
          }
        : undefined;

    return {
      forModel: complementForModel
        ? {
            ...(mainForModel as object),
            wholeDevelopmentComplement: complementForModel,
          }
        : mainForModel,
      cards: response,
    };
  },
};
