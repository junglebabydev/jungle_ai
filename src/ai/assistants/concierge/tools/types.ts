import { PRODUCT_TYPE } from "@prisma/client";
import { OpenRouterTool } from "../../../../lib/openrouter";
import {
  SearchResponseDTO,
  SearchSection,
} from "../../../../shared/dtos/SearchDTOs";
import {
  ConciergePinnedFilters,
  ConciergeScope,
} from "../../../../shared/dtos/ConciergeDTOs";

/**
 * Per-turn, server-pinned context every concierge tool runs against. The model
 * NEVER supplies any of this: `sections` (the active FE tab) and `scope` (the
 * venue) are fixed server-side so a tool can't widen past the tab or reach
 * another venue, no matter what the model puts in its arguments.
 */
export type ConciergeToolContext = {
  /** Current parent message, used only for deterministic intent grounding. */
  userMessage: string;
  /** True when this is a follow-up turn (conversation history exists) — usually a
   *  refinement, so the whole-development kit is suppressed to keep the reply focused. */
  isFollowUp?: boolean;
  sections?: SearchSection[];
  /** Product-type tab scope (include=CAMP/CLASS/…), server-pinned into the search
   *  so the model can't widen past the tab the parent is viewing. */
  productTypes?: PRODUCT_TYPE[];
  /** The kind of activity the parent asked for in their own words ("holiday camp"),
   *  carried across the conversation so a bare refinement ("in central") still
   *  searches camps. Null when they never named one, or named several. */
  askedProductType?: PRODUCT_TYPE | null;
  /** True when the parent asked about a package, membership or bundle. Packages
   *  are otherwise left out of an open browse — see `browseSections`. */
  askedForPackages?: boolean;
  scope?: ConciergeScope;
  /** `Boolean(scope?.merchantId || scope?.locationId)` — true ⇒ merchant-location chat. */
  scoped: boolean;
  /** FE-selected filter chips, server-pinned: when set they OVERRIDE the model's
   *  inferred category/region in the search. One value or an array. */
  category?: string | string[];
  region?: string | string[];
  /** FE budget chip ("under $X" ceiling), server-pinned: when set it OVERRIDES the
   *  model's inferred budget. Applied to CAMP results only (see products collection). */
  maxPrice?: number;
  /** Remaining FE filter fields (age/district/trail/day-time/amenities/…),
   *  server-pinned: each present value OVERRIDES the model's inference for that
   *  filter. Parity with /concierge/results. */
  pinnedFilters?: ConciergePinnedFilters;
};

/**
 * What a concierge tool hands back. `forModel` is the lean JSON projection the
 * LLM sees (token-bounded). `cards` is the full search payload for the FE grid —
 * leave it `undefined` to keep the current cards untouched (a tool that does NOT
 * run a search, e.g. the per-activity detail lookup).
 */
export type ConciergeToolResult = {
  forModel: unknown;
  cards?: SearchResponseDTO | null;
};

/**
 * A self-contained concierge tool: its OpenRouter definition plus a pure handler.
 * Read-only by construction — there is NO RBAC / ownership / confirm gate here
 * (all concierge data is public), which is exactly what keeps this far simpler
 * than the merchant tool contract (`assistants/merchant/tools/types.ts`). New
 * tools are added by dropping a file here and listing it in `registry.ts`.
 */
export type ConciergeTool = {
  name: string;
  definition: OpenRouterTool;
  /** Offered ONLY in the merchant-location (scoped) chat when true. */
  scopedOnly?: boolean;
  run(args: unknown, ctx: ConciergeToolContext): Promise<ConciergeToolResult>;
};
