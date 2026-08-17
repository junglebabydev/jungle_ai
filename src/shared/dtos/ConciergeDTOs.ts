import z from "zod";
import {
  BudgetFilterSchema,
  CategoryFilterSchema,
  IncludeFilterSchema,
  ProductTypeFilterSchema,
  RegionFilterSchema,
  SearchResponseDTO,
  TrailFilterSchema,
} from "./SearchDTOs";
import { ProductResponseDTO } from "./ProductDTOs";
import { MerchantResonseDTO } from "./MerchantDTOs";
import { LocationResponseDTO } from "./LocationDTOs";
import { PaginatedResponseDTO } from "./PaginationDTO";
import { ParsedSearchQuery } from "../../utils/searchQueryParser";

/**
 * Public concierge chat. `message` is hard-capped (cost / abuse guard on an
 * unauthenticated endpoint). `conversationId` is the unguessable public uuid
 * handle returned on the first turn — omit it to start a new conversation, pass
 * it back to continue one.
 */
export const ConciergeChatSchema = z.object({
  message: z.string().trim().min(1).max(500),
  conversationId: z.string().uuid().optional(),
  // Which result section(s) the chat is bound to — mirrors unified search's
  // `include` and reflects the active FE tab. Accepts an ARRAY (like the other
  // chips) OR a legacy comma-joined string; the router normalizes it with
  // parseSearchInclude. Omitted = products + merchants (the default).
  include: IncludeFilterSchema,
  // EXPLICIT FILTER CHIPS (multi-select). When the FE has category/region chips
  // selected, it sends them here and they are PINNED into every search server-side
  // (they OVERRIDE whatever the model would infer from the message), exactly like
  // `include`. Canonical, vocabulary-validated (shared with `SearchPageRequestSchema`).
  region: RegionFilterSchema,
  category: CategoryFilterSchema,
  // Product-type tab(s) — CLASS/CAMP/BIRTHDAY/DROP_IN/EVENT — the active type
  // filter. Pinned into every search server-side, narrowing the products section.
  productType: ProductTypeFilterSchema,
  // Budget chip (FE field name `budget`, like `region`/`category`): an "under $X"
  // ceiling the parent set on-screen. Pinned into every search server-side (OVERRIDES
  // any budget the model infers from the message). Applied to CAMP results only.
  // The router maps it to the engine's `maxPrice`. Shared schema with `SearchPageRequestSchema`.
  budget: BudgetFilterSchema,
  // FULL FILTER PARITY with `/concierge/results`. When the FE sends any of these,
  // they are PINNED into every search this turn (OVERRIDE what the model would
  // infer from the message), exactly like the chips above. Anything the FE omits,
  // the model still infers from `message`. Same field names + validation as
  // `SearchPageRequestSchema` so the two endpoints can't drift.
  age: z.number().int().optional(),
  district: z
    .union([z.string().max(120), z.array(z.string().max(120)).max(12)])
    .optional(),
  nearDistrict: z.string().max(120).optional(),
  trail: TrailFilterSchema,
  locationType: z.string().max(20).optional(),
  cheap: z.boolean().optional(),
  freeTrial: z.boolean().optional(),
  dropIn: z.boolean().optional(),
  termBased: z.boolean().optional(),
  meals: z.boolean().optional(),
  transport: z.boolean().optional(),
  daysOfWeek: z.array(z.number().int()).max(7).optional(),
  timeOfDay: z.string().max(20).optional(),
  // VENUE SCOPE: set these when the chat is opened from a specific merchant /
  // location card, so it becomes "the concierge for THIS place" — every search is
  // hard-limited to that venue (server-pinned). Omit for the global discovery chat.
  // The FE resends them each turn, exactly like `include`.
  merchantId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
})
  // Reject UNKNOWN keys (e.g. a mistyped `budgett`) with a 400 instead of silently
  // dropping them — a stripped typo is a silent no-op filter (the exact bug that hid
  // `budget` vs `maxPrice`). Strict = the request must use the real field names.
  .strict();

export type ConciergeChatDTO = z.infer<typeof ConciergeChatSchema>;

/**
 * FE-supplied filter values pinned into the global-discovery search (parity with
 * `/concierge/results`). Each present field OVERRIDES the model's inference; each
 * absent field is left to the model. Mirrors the pinnable subset of
 * `StructuredSearchInput`. `category`/`region`/`maxPrice`/`productTypes` keep
 * their own dedicated pins; this carries the remaining filter fields.
 */
export type ConciergePinnedFilters = {
  age?: number;
  /** One area, or the family a single word names ("bukit" → four planning areas). */
  district?: string | string[];
  nearDistrict?: string;
  trail?: string | string[];
  locationType?: string;
  cheap?: boolean;
  freeTrial?: boolean;
  dropIn?: boolean;
  termBased?: boolean;
  meals?: boolean;
  transport?: boolean;
  daysOfWeek?: number[];
  timeOfDay?: string;
};

/**
 * Where a concierge conversation is scoped. Empty / absent ⇒ the global discovery
 * chat (search ALL merchants). With ids ⇒ a merchant-location chat pinned to one
 * merchant / location. This is the single extension point for future scope
 * dimensions (e.g. a category) — add a field here and pin it in the loop + search.
 */
export type ConciergeScope = {
  merchantId?: number;
  locationId?: number;
};

/**
 * Body for the dedicated merchant-location chat endpoint
 * (`POST /concierge/merchant-location/chat`) — the per-card "concierge for THIS
 * place". Same as the discovery chat EXCEPT BOTH `merchantId` AND `locationId` are
 * REQUIRED: a store chat is an independent store pinned to exactly ONE merchant at
 * ONE location, so it only ever lists that location's activities (never merchant-
 * wide). There's no `include`: a merchant-location chat is products-only by design.
 */
export const MerchantLocationChatSchema = z.object({
  message: z.string().trim().min(1).max(500),
  conversationId: z.string().uuid().optional(),
  merchantId: z.number().int().positive(),
  locationId: z.number().int().positive(),
})
  // Reject unknown keys with a 400 (see ConciergeChatSchema) — no silent no-ops.
  .strict();

export type MerchantLocationChatDTO = z.infer<typeof MerchantLocationChatSchema>;

/**
 * A single activity line in a merchant-location ("store") response. The store
 * identity (merchant + location) is stated ONCE at the top of the response, so the
 * per-product `merchant` / `location` nesting is dropped here — it was the SAME
 * merchant/location on every row (a venue chat only ever lists one store's
 * activities), so repeating it on each product was pure duplication.
 */
export type StoreProductDTO = Omit<ProductResponseDTO, "merchant" | "location">;

/**
 * Results for a merchant-location chat. The chat is pinned to ONE merchant at ONE
 * location, so we model it as an independent STORE: the store identity lives once
 * in `store`, and only that store's activities are listed under `products`. Unlike
 * the global discovery `SearchResponseDTO`, there is NO `merchants` section (it's
 * always empty when scoped) and NO repeated per-product merchant/location.
 */
export type MerchantLocationResultsDTO = {
  query: string;
  parsed: ParsedSearchQuery;
  /** The single store this chat is pinned to (merchant + the specific location). */
  store: {
    merchant: MerchantResonseDTO | null;
    location: LocationResponseDTO | null;
  };
  /** This store's activities only (products) — already scoped server-side. */
  products: PaginatedResponseDTO<StoreProductDTO, never>;
};

/**
 * Reshape a federated `SearchResponseDTO` into the lean merchant-location "store"
 * shape: lift the store identity (merchant + location) to the top ONCE, list only
 * the products, and drop the always-empty `merchants` block plus the repeated
 * per-product merchant/location. `opts.merchant` / `opts.location` let the caller
 * supply the authoritative store identity (e.g. the chat's preloaded profile, which
 * carries location details + operating hours); otherwise it falls back to the first
 * product's nested objects.
 */
export function mapMerchantLocationResults(
  res: SearchResponseDTO,
  opts: {
    merchant?: MerchantResonseDTO | null;
    location?: LocationResponseDTO | null;
  } = {},
): MerchantLocationResultsDTO {
  const first = res.products.data[0];
  return {
    query: res.query,
    parsed: res.parsed,
    store: {
      merchant: opts.merchant ?? first?.merchant ?? null,
      location: opts.location ?? first?.location ?? null,
    },
    products: {
      ...res.products,
      // Strip the repeated per-product merchant/location — it's the store's, above.
      data: res.products.data.map(
        ({ merchant: _m, location: _l, ...rest }) => rest,
      ),
    },
  };
}

/**
 * Global catalogue counts for the concierge dashboard (`GET /concierge/counts`).
 * DELIBERATELY unfiltered — these are the whole published, indexed catalogue totals,
 * computed through the SAME `search` engine as `/chat` and `/results` (with
 * no filters), so an unfiltered search returns exactly these numbers everywhere.
 *   - `camps` / `classes` / `birthdays` / `dropIns` / `events` = products of that
 *     PRODUCT_TYPE only (a type absent from the catalogue is `0`); together they
 *     sum to the total products.
 *   - `packages`   = total purchasable packages (PackageTemplate).
 *   - `activities` = total providers (the merchants section) — the "Activities" tab.
 *   - `all`        = every card the grid shows = products + packages + providers.
 *
 * Mirror of the search service's `CatalogueCountsDTO` — keep the two in step.
 */
export type ConciergeCountsDTO = {
  all: number;
  camps: number;
  classes: number;
  birthdays: number;
  dropIns: number;
  events: number;
  packages: number;
  activities: number;
};

export type ConciergeChatResponseDTO = {
  /** The public uuid handle — the client stores this and resends to continue. */
  conversationId: string;
  reply: string;
  /**
   * Last search's results for rendering cards (or null). The global discovery chat
   * returns the federated `SearchResponseDTO`; a merchant-location chat returns the
   * leaner `MerchantLocationResultsDTO` (one store + its activities).
   */
  results: SearchResponseDTO | MerchantLocationResultsDTO | null;
};
