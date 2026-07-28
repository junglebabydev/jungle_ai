import z from "zod";
import { PRODUCT_TYPE } from "@prisma/client";
import { ParsedSearchQuery } from "../../utils/searchQueryParser";
import { PaginatedResponseDTO } from "./PaginationDTO";
import { ProductResponseDTO } from "./ProductDTOs";
import { MerchantResonseDTO } from "./MerchantDTOs";
import { PackageTemplateResponseDTO } from "./PackageTemplateDTOs";
import { ACTIVITY_CATEGORIES, SEARCH_REGIONS, TRAILS } from "../constants";

/**
 * Reusable concierge FILTER-CHIP schemas — the canonical, validated input for the
 * `category` / `region` chips, shared by every concierge entry point (the chat
 * `ConciergeChatSchema` and the pagination `SearchPageRequestSchema`) so the
 * contract can't drift between them.
 *
 * Each chip is validated against the canonical vocabulary (case-insensitive) — an
 * unknown value is a 400, not a silent pass, because these come from a FIXED set
 * of on-screen chips (unlike the free-text `query`/`district` fields, which stay
 * lenient + grounded). Accepts ONE chip or an ARRAY (multi-select). The server
 * still grounds the values into facets (`unified-search/categoryVocabulary.ts`).
 */
const inVocabulary = (allowed: readonly string[]) => (value: string) =>
  allowed.some((a) => a.toLowerCase() === value.trim().toLowerCase());

const CategoryChip = z
  .string()
  .refine(inVocabulary(ACTIVITY_CATEGORIES), {
    message: `Invalid category. Allowed: ${ACTIVITY_CATEGORIES.join(", ")}`,
  });
const RegionChip = z
  .string()
  .refine(inVocabulary(SEARCH_REGIONS), {
    message: `Invalid region. Allowed: ${SEARCH_REGIONS.join(", ")}`,
  });

/** Category chip(s): one or an array, each a canonical `ACTIVITY_CATEGORIES` value. */
export const CategoryFilterSchema = z
  .union([CategoryChip, z.array(CategoryChip).max(ACTIVITY_CATEGORIES.length)])
  .optional();
/** Region chip(s): one or an array, each a canonical `SEARCH_REGIONS` value
 *  (incl. "Anywhere" = no preference). */
export const RegionFilterSchema = z
  .union([RegionChip, z.array(RegionChip).max(SEARCH_REGIONS.length)])
  .optional();
/** Budget chip: a single "under $X" ceiling (SGD, positive). The FE budget filter,
 *  shared by the chat (`ConciergeChatSchema`) and pagination (`SearchPageRequestSchema`)
 *  so the contract can't drift. Ceiling only — no floor. Applied server-side to CAMP
 *  results only (camps carry a reliable price; other types aren't price-filtered). */
export const BudgetFilterSchema = z.number().positive().optional();
const TrailValue = z.enum(TRAILS);
export const TrailFilterSchema = z
  .union([TrailValue, z.array(TrailValue).max(TRAILS.length)])
  .optional();
/** Product-type chip(s): one or an array of `PRODUCT_TYPE` (CLASS / CAMP /
 *  BIRTHDAY / DROP_IN / EVENT). Narrows the products section to those type(s);
 *  the FE sends whichever type tabs the parent has active. Shared by the chat and
 *  pagination endpoints so the contract can't drift. */
const ProductTypeValue = z.nativeEnum(PRODUCT_TYPE);
export const ProductTypeFilterSchema = z
  .union([ProductTypeValue, z.array(ProductTypeValue).max(5)])
  .optional();
/** Section/tab `include` filter — one value or an ARRAY (like the other chips),
 *  or a legacy comma-joined string. Values: `ALL` / `MERCHANT` / `PRODUCTS` /
 *  `PACKAGES` (+ legacy `products` / `merchants`, case-insensitive). Grounded by
 *  `parseSearchInclude`, which drops anything unrecognised — so lenient here. */
export const IncludeFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional();

/** Coerce the validated `productType` chip (one or an array) into a `PRODUCT_TYPE[]`
 *  the search consumes; `undefined`/empty when unset. */
export function normalizeProductTypes(
  raw: PRODUCT_TYPE | PRODUCT_TYPE[] | undefined,
): PRODUCT_TYPE[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? [...new Set(raw)] : [raw];
}

/**
 * Federated natural-language search response. `query` echoes the raw user query
 * and `parsed` exposes the hard filters the parser lifted out of it (for FE
 * filter-chip display). Each section is relevance-ranked (no orderBy), hence the
 * `never` order-by key on the pagination envelopes.
 */
export type SearchResponseDTO = {
  query: string;
  parsed: ParsedSearchQuery;
  products: PaginatedResponseDTO<ProductResponseDTO, never>;
  merchants: PaginatedResponseDTO<MerchantResonseDTO, never>;
  /** Purchasable packages (PackageTemplate) — populated only when the caller's
   *  `include` requests the `packages` scope; otherwise an empty envelope. */
  packages: PaginatedResponseDTO<PackageTemplateResponseDTO, never>;
  /** Set by the concierge when the exact request matched NOTHING and the results
   *  were BROADENED (the parent's activity/area/age filters were relaxed) so the grid
   *  is never empty. The FE should label these as "no exact matches — nearby options",
   *  and confinement invariants (region/age) don't apply to a broadened set. */
  broadened?: boolean;
};

/**
 * Raw structured search input — what the concierge agent forwards from the LLM's
 * `search_activities` tool call. The LLM owns query UNDERSTANDING (it puts the
 * bare activity in `query` and lifts each stated detail into its typed field,
 * normalising place typos to real names); `UnifiedSearchService.search`
 * then GROUNDS these against the real vocabulary (district/region membership,
 * INDOOR/OUTDOOR, age range, day/time buckets) and drops anything unrecognised —
 * so an invented or misspelled value becomes a broader search, never a bad
 * filter. All fields except `query` are optional (only stated filters are sent).
 */
export type StructuredSearchInput = {
  /** The bare activity term (e.g. "swimming"); "" ⇒ browse by filters alone. */
  query: string;
  /**
   * VENUE SCOPE (server-pinned, never model-supplied — like `sections`). When set,
   * the product search is HARD-LIMITED to this merchant / location, so a per-card
   * "concierge for THIS place" only ever surfaces that venue's offerings. The
   * Typesense product doc already carries both ids (collections/products.ts), so
   * this is a pure filter pass-through. Extend here for future scope dimensions.
   */
  merchantId?: number;
  locationId?: number;
  age?: number;
  /** Exact area ("in/at X"). Validated against the DB district vocabulary. */
  district?: string;
  /** Proximity area ("near/around X") → distance ranking. Validated likewise. */
  nearDistrict?: string;
  /** Broad region chip(s) — one OR an array (multi-select, OR-ed). Grounded by
   *  `normalizeSearchRegions` (Anywhere → none; the SG_REGIONS pass). */
  region?: string | string[];
  /** Canonical activity-category chip(s) — one OR an array (multi-select, OR-ed),
   *  each one of `ACTIVITY_CATEGORIES`. Grounded by `groundActivityCategories` →
   *  category facet(s), and/or a product-type / location-type filter for the
   *  overlap chips (Camps, Birthdays, Indoor play, Outdoor). */
  category?: string | string[];
  /** Explorer Map trail intent. Matches both primary and "also builds" tags. */
  trail?: string | string[];
  /** "INDOOR" | "OUTDOOR"; anything else dropped. */
  locationType?: string;
  maxPrice?: number;
  cheap?: boolean;
  freeTrial?: boolean;
  dropIn?: boolean;
  termBased?: boolean;
  meals?: boolean;
  transport?: boolean;
  /** Day ints, Sun=0…Sat=6; out-of-range values dropped. */
  daysOfWeek?: number[];
  /** "morning" | "afternoon" | "evening"; anything else dropped. */
  timeOfDay?: string;
  page?: number;
  pageSize?: number;
  sections?: SearchSection[];
  /** Product-type scope pinned from the `include` tab (CLASS/CAMP/BIRTHDAY/
   *  DROP_IN/EVENT). Server-set (never model-supplied); overrides any type the
   *  category chips implied, so `include=CAMP` returns only camps. */
  productTypes?: PRODUCT_TYPE[];
  /** Opt in to dropping the provider and package sections whenever a product type
   *  is grounded from the request, so a typed ask ("holiday camps") comes back as
   *  activities of that type alone. Off by default — a caller that wants the mixed
   *  grid simply omits it. */
  productsOnlyWhenTypeGrounded?: boolean;
};

/**
 * Request body for the non-LLM pagination endpoint (`POST /concierge/results`):
 * the FE replays the chat's search spec (the `query` + grounded `parsed` filters
 * it received) for page N, so the card grid paginates / "loads more" WITHOUT
 * another model turn. Mirrors `StructuredSearchInput` (the same fields the
 * concierge tool fills) plus `include` for section binding. Every filter is
 * re-GROUNDED server-side by `search` (untrusted client input — a
 * tampered district/region is simply dropped), so lenient field types are safe.
 *
 * Keep in sync with `StructuredSearchInput` above.
 */
export const SearchPageRequestSchema = z.object({
  query: z.string().max(200).optional(),
  // Venue scope — kept so the card-grid pagination endpoint stays scoped to the
  // same place the chat was bound to (re-grounded server-side, same as the chat).
  merchantId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  age: z.number().int().optional(),
  district: z.string().max(120).optional(),
  nearDistrict: z.string().max(120).optional(),
  // Canonical, vocabulary-validated chip filters (one or an array) — the FE
  // replays the selected chips; shared with the chat schema.
  region: RegionFilterSchema,
  category: CategoryFilterSchema,
  trail: TrailFilterSchema,
  // Product-type tab(s) — CLASS/CAMP/BIRTHDAY/DROP_IN/EVENT — narrowing the
  // products section. Pinned server-side like the other chips.
  productType: ProductTypeFilterSchema,
  locationType: z.string().max(20).optional(),
  // Budget chip — FE field is `budget` (same as the chat). `maxPrice` is also accepted
  // for a parsed-spec replay; the handler normalizes `budget ?? maxPrice`. Camp-scoped.
  budget: BudgetFilterSchema,
  maxPrice: BudgetFilterSchema,
  cheap: z.boolean().optional(),
  freeTrial: z.boolean().optional(),
  dropIn: z.boolean().optional(),
  termBased: z.boolean().optional(),
  meals: z.boolean().optional(),
  transport: z.boolean().optional(),
  daysOfWeek: z.array(z.number().int()).max(7).optional(),
  timeOfDay: z.string().max(20).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  include: IncludeFilterSchema,
})
  // Reject unknown keys with a 400 (see ConciergeChatSchema) — a mistyped filter
  // must fail loudly, not silently drop to an unfiltered search.
  .strict();

export type SearchPageRequestDTO = z.infer<typeof SearchPageRequestSchema>;

/**
 * The selectable result sections. The FE can request one or both (multi-select)
 * via `?include=`; an omitted/empty/unrecognized selection means BOTH (the
 * default). An excluded section is skipped entirely (no Typesense call) and comes
 * back as an empty paginated envelope so the response shape never changes.
 */
export const SEARCH_SECTIONS = ["products", "merchants", "packages"] as const;
export type SearchSection = (typeof SEARCH_SECTIONS)[number];

/**
 * Normalize the raw `?include=` query value into a list of valid sections.
 * Accepts a repeated param (`?include=products&include=merchants`) OR a
 * comma-joined value (`?include=products,merchants`), case-insensitively.
 * Returns `undefined` when nothing valid was supplied → caller treats as "both".
 *
 * Legacy shim: the richer `parseSearchInclude` below is the source of truth for
 * the tab vocabulary (ALL/MERCHANT/CLASS/…/PACKAGES); this thin wrapper returns
 * just its `sections` for callers that don't need the product-type scope.
 */
export function parseSearchSections(raw: unknown): SearchSection[] | undefined {
  return parseSearchInclude(raw).sections;
}

/**
 * The `include` tab vocabulary the FE toggles, resolved into the search's
 * scope primitives. Values (case-insensitive, comma- or repeat-separated):
 *   ALL      → merchants + products (all types) + packages
 *   MERCHANT → merchants only
 *   CLASS/CAMP/BIRTHDAY/DROP_IN/EVENT → products scoped to that PRODUCT_TYPE
 *   PACKAGES → packages only
 * The legacy lowercase `products` / `merchants` tokens keep working. An empty /
 * unrecognized selection returns `sections: undefined` → caller treats as the
 * default (products + merchants). `productTypes` narrows the products section.
 */
export type SearchInclude = {
  sections?: SearchSection[];
  productTypes: PRODUCT_TYPE[];
};

const INCLUDE_TYPE_TOKENS: Record<string, PRODUCT_TYPE> = {
  CLASS: PRODUCT_TYPE.CLASS,
  CAMP: PRODUCT_TYPE.CAMP,
  CAMPS: PRODUCT_TYPE.CAMP,
  BIRTHDAY: PRODUCT_TYPE.BIRTHDAY,
  BIRTHDAYS: PRODUCT_TYPE.BIRTHDAY,
  DROP_IN: PRODUCT_TYPE.DROP_IN,
  DROPIN: PRODUCT_TYPE.DROP_IN,
  "DROP-IN": PRODUCT_TYPE.DROP_IN,
  EVENT: PRODUCT_TYPE.EVENT,
  EVENTS: PRODUCT_TYPE.EVENT,
};

export function parseSearchInclude(raw: unknown): SearchInclude {
  const tokens = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const sections = new Set<SearchSection>();
  const productTypes = new Set<PRODUCT_TYPE>();

  for (const token of tokens) {
    if (token === "ALL") {
      sections.add("products");
      sections.add("merchants");
      sections.add("packages");
    } else if (token === "MERCHANT" || token === "MERCHANTS") {
      sections.add("merchants");
    } else if (token === "PRODUCT" || token === "PRODUCTS") {
      sections.add("products");
    } else if (token === "PACKAGE" || token === "PACKAGES") {
      sections.add("packages");
    } else if (INCLUDE_TYPE_TOKENS[token]) {
      sections.add("products");
      productTypes.add(INCLUDE_TYPE_TOKENS[token]);
    }
    // Unknown tokens are ignored → fall through to the default section set.
  }

  return {
    sections: sections.size
      ? SEARCH_SECTIONS.filter((s) => sections.has(s))
      : undefined,
    productTypes: [...productTypes],
  };
}
