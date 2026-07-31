import { AI_TURN_ROLE, ConciergeTurn, PRODUCT_TYPE } from "@prisma/client";
import {
  ChatStreamEvent,
  getConciergeModels,
  getConciergeProviderOrder,
  OpenRouterMessage,
  streamChatCompletion,
} from "../../../lib/openrouter";
import { ServiceLocator } from "../../../services";
import {
  parseSearchQuery,
  buildDistrictMatchers,
} from "../../../utils/searchQueryParser";
import {
  deriveExplorerMapTrails,
  inferActivityCategoriesFromText,
} from "../../../shared/trails";
import { SearchResponseDTO, SearchSection } from "../../../shared/dtos/SearchDTOs";
import {
  ConciergePinnedFilters,
  ConciergeScope,
  MerchantLocationResultsDTO,
  mapMerchantLocationResults,
} from "../../../shared/dtos/ConciergeDTOs";
import { LruTtlCache } from "../../../lib/cache/lruTtlCache";
import {
  screenInput,
  redactReply,
  createStreamRedactor,
  spotlightToolResult,
} from "../../shared/guard";
import {
  ChatModelEvent,
  ChatToolEvent,
  emitConciergeTelemetry,
} from "../../shared/evalLog";
import {
  ChildProfile,
  productDiscoverySystemPrompt,
} from "./productDiscoveryPrompt";
import { merchantLocationSystemPrompt } from "./merchantLocationPrompt";
import {
  conciergeToolsFor,
  CONCIERGE_TOOLS_BY_NAME,
} from "./tools/registry";
import { ConciergeToolContext } from "./tools/types";
import { namedPackages, namedProductType } from "./tools/search";
import { featuredResults, isVagueAsk } from "./featuredBrowse";
import { CONCIERGE_OPENING_TURN } from "./promptShared";
import { VenueContext, buildVenueContext } from "./venueContext";

/** Parent-facing refusal — the shared merchant SAFE_REFUSAL talks about managing
 *  a store, which is wrong for a public discovery chat. */
const CONCIERGE_SAFE_REFUSAL =
  "I can only help you find kids' activities and classes here — tell me what you're after, roughly where, and for what age, and I'll look.";

/** DETERMINISTIC child-safety net. A message that reads as a distressed child (not an
 *  activity search) gets a caring, escalation-first reply BEFORE any model call — a
 *  safety-critical response must never depend on model variance. Adjacency-anchored
 *  ("i'm scared", "i'm home alone") so a genuine search ("a class for my scared 5yo")
 *  never trips it. */
const CONCIERGE_SAFETY_REPLY =
  "I'm really glad you reached out. If you feel unsafe or scared right now, please tell a parent, guardian, or another trusted adult near you as soon as you can. If you're in danger or it's an emergency in Singapore, call 999 for the police or 995 for an ambulance right away. You're not alone, and asking an adult you trust for help is exactly the right thing to do.";

const CHILD_DISTRESS_RE =
  /\bi(?:'m| am)\s+(scared|afraid|frightened|terrified|unsafe|in danger|home alone|all alone|lost|hurt|bleeding|being hurt)\b|\bhelp me\b|\bsomeone (?:is )?(?:hurting|scaring|following) me\b/i;
function isChildDistress(msg: string): boolean {
  return CHILD_DISTRESS_RE.test(String(msg || ""));
}

/** Concierge-specific prompt-leak signatures, layered on top of the shared ones
 *  in guard.ts: its own prompt section headers + tool name, none of which ever
 *  appear in a genuine parent-facing reply. */
const CONCIERGE_LEAK_SIGNATURES: RegExp[] = [
  /HOW YOU WORK/i,
  /HOW YOU REPLY/i,
  /\bsearch_activities\b/i,
  /\bget_activity_details\b/i,
];

/** The fast model occasionally parrots the spotlight wrapper around the (PUBLIC)
 *  search results back into its reply. That's cosmetic, not a leak, so we STRIP
 *  the echoed block — including one still open at the stream tail (`(?:>>|$)`) —
 *  rather than refuse the whole (otherwise good) answer. The stripped substring is
 *  also what was tripping the `UNTRUSTED_TOOL_DATA` / `search_activities`
 *  signatures, so removing it lets the genuine prose through. */
const CONCIERGE_STRIP_BLOCKS: RegExp[] = [
  /<<\s*UNTRUSTED_TOOL_DATA[\s\S]*?(?:>>|$)/gi,
  /<<\s*END_UNTRUSTED_TOOL_DATA\s*>>/gi,
];

// All four are prod-tunable via env (no magic literals); defaults preserve
// current behavior. Bumped per-deployment without a code change.
/** Only the last N turns are replayed to the model (history cap / cost guard). */
const HISTORY_LIMIT = Number(process.env.CONCIERGE_HISTORY_LIMIT || 20);
/** Max sequential model round-trips per request (search → summarize is ~2). */
const MAX_STEPS = Number(process.env.CONCIERGE_MAX_STEPS || 5);
/** Per-turn token budget — stop making model calls past this (Denial-of-Wallet). */
const TURN_TOKEN_BUDGET = Number(process.env.CONCIERGE_TURN_TOKEN_BUDGET || 80000);

/**
 * SEARCH-FIRST (global discovery only, flag-gated, default OFF). When on, the
 * server builds the search deterministically (parseSearchQuery + FE pins + the
 * tool's own trail/category inference) and runs it BEFORE the model, then makes a
 * single model call to summarise — dropping model round-trip #1. Flip
 * `CONCIERGE_SEARCH_FIRST=true` only after a quality spot-check. See
 * docs/concierge/search-first-proposal.md.
 */
const SEARCH_FIRST = process.env.CONCIERGE_SEARCH_FIRST === "true";

/**
 * District vocabulary → matcher cache. `parseSearchQuery` can only classify a
 * typed area ("in/near Tanglin") when handed the DB-derived district list, which
 * the concierge otherwise omits. Districts change rarely, so cache the built
 * matchers for a long TTL (single-flight via getOrLoad). Only touched in
 * search-first mode.
 */
const districtMatcherCache = new LruTtlCache<
  ReturnType<typeof buildDistrictMatchers>
>({
  max: 1,
  ttlMs: Number(process.env.CONCIERGE_DISTRICT_CACHE_TTL_MS || 600_000),
});

function getDistrictMatchers(): Promise<
  ReturnType<typeof buildDistrictMatchers>
> {
  return districtMatcherCache.getOrLoad("districts", async () =>
    buildDistrictMatchers(
      await ServiceLocator.LocationService.internal.getDistinctDistricts(),
    ),
  );
}

/**
 * Per-(merchant,location) cache for the venue preload. `buildVenueContext` does 3
 * lookups (merchant + location + catalogue) and is otherwise re-run on EVERY turn of
 * a chat even though the profile is effectively static within a conversation — so we
 * cache it for a short TTL. Single-flight (`getOrLoad`) also collapses the cold-start
 * stampede when several first-turns for the same place land together. The IN-TURN
 * `search_activities` tool call is NEVER cached (always live), so only the opening
 * ABOUT block + card seed can be up to TTL stale — an acceptable trade for dropping
 * 3 queries/turn. Per-process, no Redis (same design as the signed-URL cache).
 */
const venueContextCache = new LruTtlCache<VenueContext>({
  max: Number(process.env.CONCIERGE_VENUE_CACHE_MAX || 200),
  ttlMs: Number(process.env.CONCIERGE_VENUE_CACHE_TTL_MS || 60_000),
});

/** Test-only: drop the venue-context cache so cases don't bleed into each other. */
export function _resetVenueContextCache(): void {
  venueContextCache.clear();
}

export type RunConciergeTurnInput = {
  conversationId: number;
  /** For per-conversation cost attribution (OpenRouter `user`). */
  publicId: string;
  model: string;
  userMessage: string;
  /** Result section(s) the chat is bound to (the active FE tab: Activities →
   *  merchants, Camps → products). Pinned into every search — the model can't
   *  change it. Undefined = both. */
  sections?: SearchSection[];
  /** Product-type scope from a type tab (include=CLASS/CAMP/BIRTHDAY/DROP_IN/
   *  EVENT). PINNED into every search like `sections` — the model can't change it. */
  productTypes?: PRODUCT_TYPE[];
  /** Explicit category/region filter chips selected in the FE. When present they
   *  are PINNED into every search (override the model's inferred values), like
   *  `sections`. One value or an array. */
  category?: string | string[];
  region?: string | string[];
  /** FE budget chip ("under $X" ceiling). PINNED into every search (overrides the
   *  model's inferred budget), like `category`/`region`. Camp-scoped server-side. */
  maxPrice?: number;
  /** Remaining FE filter fields (age, district, trail, day/time, amenities, …) —
   *  parity with `/concierge/results`. Each present value PINS/overrides the
   *  model's inference for that filter; absent ones are left to the model. */
  pinnedFilters?: ConciergePinnedFilters;
  /** merchant-location SCOPE (server-pinned). When set (chat opened from a merchant/location
   *  card), every search is hard-limited to that merchantLocation and the assistant becomes
   *  "the concierge for THIS place". Undefined = the global discovery chat. */
  scope?: ConciergeScope;
  onToken?: (delta: string) => void;
  onReset?: () => void;
};

export type RunConciergeTurnResult = {
  reply: string;
  /** The last search's results, for the frontend to render cards. The global
   *  discovery chat returns the federated `SearchResponseDTO`; a merchant-location
   *  chat returns the leaner "store" shape (one merchant/location + its activities). */
  results: SearchResponseDTO | MerchantLocationResultsDTO | null;
};

function turnToMessage(turn: ConciergeTurn): OpenRouterMessage {
  return {
    role: turn.role === AI_TURN_ROLE.USER ? "user" : "assistant",
    content: turn.content,
  };
}

/**
 * When the FE has pinned category/region chips, tell the model they are ACTIVE so
 * it SEARCHES with them instead of asking "which activity?" — the server pins the
 * values into the search regardless, this note just stops a needless clarifying
 * question when the parent has already filtered on screen. "Anywhere" is no area
 * preference, so it's not announced. Returns null when no real chip is set.
 */
function activeFiltersNote(
  category?: string | string[],
  region?: string | string[],
  maxPrice?: number,
  productTypes?: PRODUCT_TYPE[],
): string | null {
  const toList = (v?: string | string[]) =>
    v == null ? [] : Array.isArray(v) ? v : [v];
  const cats = toList(category).map((c) => c.trim()).filter(Boolean);
  const regs = toList(region)
    .map((r) => r.trim())
    .filter((r) => r && r.toLowerCase() !== "anywhere");
  const budget =
    typeof maxPrice === "number" && maxPrice > 0 ? maxPrice : null;
  const types = productTypes ?? [];
  if (!cats.length && !regs.length && !budget && !types.length) return null;

  const parts: string[] = [];
  if (cats.length) parts.push(`category: ${cats.join(", ")}`);
  if (regs.length) parts.push(`area: ${regs.join(", ")}`);
  if (budget) parts.push(`budget: under $${budget}`);
  if (types.length) parts.push(`type: ${types.join(", ")}`);
  return `ACTIVE FILTERS the parent has already selected via on-screen chips (${parts.join(
    "; ",
  )}). These chips ARE the request. You MUST call search_activities THIS turn to show matching results. If the parent has NOT named a specific activity, call it anyway with query="" (the chips alone are enough to browse). NEVER reply with only a clarifying question when a chip is selected — do not ask "which activity?" or "which area?". You do not set these fields yourself; the server applies the chips to every search.`;
}

/**
 * Deterministic MULTI-TURN context carry (global discovery only). The model is
 * unreliable at carrying an established activity/age/area across a refinement turn
 * ("swimming" → "any in the east?" must STAY swimming, not become an area browse).
 * So we parse every prior user turn plus the current one, accumulate the last-set
 * value per field (later turns override; an empty turn never resets), and hand the
 * model an EXPLICIT context block — far stronger than relying on it to re-derive
 * intent from the replayed history. Reuses `parseSearchQuery`; no LLM call, no DB.
 * Returns null when nothing is established. The venue prompt has its own context.
 */
/**
 * The kind of activity the parent is asking about, carried across the turn the
 * same way the rest of their stated context is. A refinement is rarely a whole
 * sentence — after "camps for a 5 year old", the next message is just "in
 * central", and read alone it names nothing. Scanning back through what they said
 * keeps the search on camps; taking the newest statement first means switching to
 * "classes" is honoured on the turn they say it.
 */
function askedProductTypeFor(
  currentMessage: string,
  history: ConciergeTurn[],
): PRODUCT_TYPE | null {
  const newestFirst = [
    currentMessage,
    ...history
      .filter((turn) => turn.role === AI_TURN_ROLE.USER)
      .map((turn) => turn.content)
      .reverse(),
  ];
  for (const message of newestFirst) {
    const named = namedProductType(message || "");
    if (named) return named;
  }
  return null;
}

function accumulateContext(
  history: ConciergeTurn[],
  currentMessage: string,
  districtMatchers?: ReturnType<typeof buildDistrictMatchers>,
): Record<string, unknown> {
  const userMsgs = [
    ...history
      .filter((t) => t.role === AI_TURN_ROLE.USER)
      .map((t) => t.content),
    currentMessage,
  ];
  const acc: Record<string, unknown> = {};
  for (const msg of userMsgs) {
    const { filters, cleanedQuery } = parseSearchQuery(msg || "", {
      districtMatchers,
    });
    if (cleanedQuery && cleanedQuery.trim()) acc.activity = cleanedQuery.trim();
    for (const k of [
      "age",
      "region",
      "district",
      "nearDistrict",
      "maxPrice",
      "cheap",
      "freeTrial",
      "dropIn",
      "termBased",
      "meals",
      "transport",
      "daysOfWeek",
      "timeOfDay",
      "locationType",
    ] as const) {
      const v = (filters as Record<string, unknown>)[k];
      if (v !== undefined) acc[k] = v;
    }
  }
  return acc;
}

function renderCarryNote(acc: Record<string, unknown>): string | null {
  const lines: string[] = [];
  if (acc.activity) lines.push(`- activity: ${acc.activity}`);
  if (acc.age != null) lines.push(`- age: ${acc.age}`);
  if (acc.region)
    lines.push(
      `- region: ${Array.isArray(acc.region) ? (acc.region as string[]).join(", ") : acc.region}`,
    );
  if (acc.district) lines.push(`- area (in): ${acc.district}`);
  if (acc.nearDistrict) lines.push(`- area (near): ${acc.nearDistrict}`);
  if (acc.maxPrice != null) lines.push(`- budget: under $${acc.maxPrice}`);
  else if (acc.cheap) lines.push(`- budget: cheapest / most affordable`);
  if (Array.isArray(acc.daysOfWeek) && acc.daysOfWeek.length)
    lines.push(`- days: ${(acc.daysOfWeek as number[]).join(", ")}`);
  if (acc.timeOfDay) lines.push(`- time: ${acc.timeOfDay}`);
  if (acc.locationType) lines.push(`- venue type: ${acc.locationType}`);
  if (!lines.length) return null;
  return (
    "SEARCH CONTEXT established this conversation — apply ALL of these to your " +
    "search THIS turn, and KEEP them across turns unless the parent changes one. A " +
    "message that only adds or changes an area, age, budget, day, time or format " +
    "KEEPS the established activity (never drop it into an unfiltered browse); switch " +
    "the activity ONLY when the parent names a different one:\n" +
    lines.join("\n")
  );
}

/** Total cards (products + providers + packages) in a search response; 0 when null. */
function totalCards(r: SearchResponseDTO | null): number {
  if (!r) return 0;
  return (
    (r.products?.total ?? 0) +
    (r.merchants?.total ?? 0) +
    (r.packages?.total ?? 0)
  );
}

/**
 * GUARANTEE DATA (global discovery). The parent must never face an empty grid — an
 * empty result set makes the platform look barren. When the turn produced no cards
 * (the model asked a question without searching, or the search matched nothing —
 * e.g. an over-narrow "Music in Central" with no inventory), broaden progressively,
 * staying as close to the parent's intent as possible and stopping at the first
 * non-empty step:
 *   1. the parsed activity term, keeping every pinned filter;
 *   2. a filter-only browse (no activity term), keeping the pins;
 *   3. relax only the ACTIVITY/topic but keep the HARD scope (age + area) — "other
 *      activities for their child in their area";
 *   4. last resort — relax the hard scope too and browse the whole tab, flagging the
 *      result `broadened` so the FE can label it "no exact matches — nearby options"
 *      and confinement checks treat it as intentional, not a leak.
 * Returns the current results unchanged when they already have cards, or when the
 * catalogue is genuinely empty for this tab.
 */
async function guaranteeResults(
  current: SearchResponseDTO | null,
  searchCtx: ConciergeToolContext,
  userMessage: string,
): Promise<SearchResponseDTO | null> {
  if (totalCards(current) > 0) return current;

  const search = (query: string, ctx: ConciergeToolContext) =>
    CONCIERGE_TOOLS_BY_NAME.search_activities
      .run({ query }, ctx)
      .then((out) => out.cards ?? null);

  const parsed = parseSearchQuery(userMessage).filters;
  const pf = searchCtx.pinnedFilters ?? {};
  const term = parseSearchQuery(userMessage).cleanedQuery;

  // 1 & 2 — stay within the parent's pins (activity term, then filter-only browse).
  for (const query of term ? [term, ""] : [""]) {
    const cards = await search(query, searchCtx);
    if (totalCards(cards) > 0) return cards;
  }

  // 3 — broaden the topic but KEEP the hard scope (age + area). Clearing the message
  // stops the tool inferring a `trail` from it; a typed age lives in the message, so
  // recover it deterministically (FE pins otherwise win).
  const scopedCtx: ConciergeToolContext = {
    ...searchCtx,
    userMessage: "",
    category: undefined,
    maxPrice: undefined,
    pinnedFilters: {
      age: pf.age ?? parsed.age,
      district: pf.district,
      nearDistrict: pf.nearDistrict,
    },
  };
  const scopedCards = await search("", scopedCtx);
  if (totalCards(scopedCards) > 0) return scopedCards;

  // 4 — relax the hard scope too and browse the whole tab; flag the result broadened.
  const wideCtx: ConciergeToolContext = {
    ...searchCtx,
    userMessage: "",
    category: undefined,
    region: undefined,
    maxPrice: undefined,
    pinnedFilters: undefined,
  };
  const wideCards = await search("", wideCtx);
  if (totalCards(wideCards) > 0) {
    wideCards!.broadened = true;
    return wideCards;
  }
  return current;
}

/**
 * Build a child trail profile from the conversation history PLUS the current
 * message, deterministically. Reuses existing utilities — no LLM call, no new DB
 * queries. The current turn is included so coverage/memory reflect what the parent
 * just said (history alone excludes it — it isn't persisted until the turn ends).
 */
function buildChildProfile(
  turns: ConciergeTurn[],
  currentMessage: string,
): ChildProfile | null {
  let age: number | null = null;
  const seen = new Set<string>();

  const userTexts = [
    ...turns.filter((t) => t.role === AI_TURN_ROLE.USER).map((t) => t.content),
    currentMessage,
  ];
  for (const content of userTexts) {
    const parsed = parseSearchQuery(content);
    if (parsed.filters.age != null && age == null) age = parsed.filters.age;
    for (const cat of inferActivityCategoriesFromText(content)) seen.add(cat);
  }

  const mentionedActivities = [...seen];
  if (age == null && mentionedActivities.length === 0) return null;

  const coverage = deriveExplorerMapTrails(mentionedActivities);
  return {
    age,
    mentionedActivities,
    exploredTrails: coverage.primaryTrails,
    alsoExploredTrails: coverage.alsoBuildsTrails,
  };
}

/**
 * One public concierge turn: screen the input, replay capped history, run the
 * tool-calling loop (tools come from `tools/registry`; the per-venue chat also
 * gets `get_activity_details`), persist the
 * user+assistant turns, and return the reply plus the last search's full results
 * for the frontend. Read-only: no RBAC, no writes, no confirm gate — but it
 * reuses the same input screen + output redaction defenses as the merchant agent.
 */
export async function runConciergeTurn(
  input: RunConciergeTurnInput,
): Promise<RunConciergeTurnResult> {
  const { conversationId, publicId, model, userMessage } = input;
  const conv = ServiceLocator.ConciergeConversationService.internal;
  // Fast, concierge-specific model chain (NOT the merchant agent's heavy chain) —
  // the main latency lever. Passed per-call so no other caller is affected.
  const conciergeModels = getConciergeModels();

  // (0) Deterministic input screen — refuse prompt-extraction / override attempts
  //     before any model call (defense in depth).
  const screen = screenInput(userMessage);
  if (screen.blocked) {
    console.warn(
      `[concierge.security] blocked input (${screen.reason}) conversation=${conversationId}`,
    );
    input.onToken?.(CONCIERGE_SAFE_REFUSAL);
    await conv.appendTurns(conversationId, [
      { role: AI_TURN_ROLE.USER, content: userMessage },
      { role: AI_TURN_ROLE.ASSISTANT, content: CONCIERGE_SAFE_REFUSAL },
    ]);
    return { reply: CONCIERGE_SAFE_REFUSAL, results: null };
  }

  // (0b) Deterministic child-safety net — a distressed-child message gets a caring,
  //      escalation-first reply before any model call (never model-dependent).
  if (isChildDistress(userMessage)) {
    console.warn(
      `[concierge.safety] child-distress cue handled deterministically conversation=${conversationId}`,
    );
    input.onToken?.(CONCIERGE_SAFETY_REPLY);
    await conv.appendTurns(conversationId, [
      { role: AI_TURN_ROLE.USER, content: userMessage },
      { role: AI_TURN_ROLE.ASSISTANT, content: CONCIERGE_SAFETY_REPLY },
    ]);
    return { reply: CONCIERGE_SAFETY_REPLY, results: null };
  }

  const scoped = Boolean(input.scope?.merchantId || input.scope?.locationId);

  // History load and the (scoped) venue preload are independent, so run them
  // CONCURRENTLY instead of serially — a venue chat no longer pays history-read +
  // 4-lookup preload back-to-back. Global discovery has no venue, so this is just
  // the history read. The preload is cached per scope (static per place), so every
  // turn of every chat for one store shares one preload.
  const [history, venue] = await Promise.all([
    conv.getRecentTurns(conversationId, HISTORY_LIMIT),
    scoped
      ? venueContextCache.getOrLoad(
          `${input.scope?.merchantId ?? ""}:${input.scope?.locationId ?? ""}`,
          () => buildVenueContext(input.scope as ConciergeScope),
        )
      : Promise.resolve(undefined),
  ]);

  // Build child trail profile from the conversation history (age + tried activities
  // → trail coverage). Used only in the global discovery prompt — the venue prompt
  // has its own preloaded context. Deterministic, no LLM call, no PII stored.
  const childProfile = buildChildProfile(history, userMessage);

  // Two distinct prompts: the per-venue guide (knows ONE place from its preloaded
  // profile) vs the global discovery prompt (searches everything). When the FE has
  // pinned filter chips, append the ACTIVE FILTERS note so the model searches with
  // them instead of asking "which activity?" on a vague message.
  const baseSystem = venue
    ? merchantLocationSystemPrompt(venue)
    : productDiscoverySystemPrompt({ sections: input.sections, childProfile });

  // Budget precedence: the FE chip wins; otherwise DETERMINISTICALLY lift a budget
  // the parent TYPED this turn ("under $100", "max 80", "cheaper than 50") straight
  // from the message ourselves. The model is unreliable at putting a stated budget
  // into the tool's maxPrice, so we don't depend on it — we pin the parsed value
  // like a chip (it overrides the model). Reuses the same NL parser that backs the
  // LLM-free search fallback, so age vs. price disambiguation ("under 5s") is shared.
  const pinnedMaxPrice =
    input.maxPrice ?? parseSearchQuery(input.userMessage).filters.maxPrice;

  const filtersNote = activeFiltersNote(
    input.category,
    input.region,
    pinnedMaxPrice,
    input.productTypes,
  );

  // Deterministic multi-turn context carry — global discovery only (the venue prompt
  // preloads its own context). Accumulate the established activity/age/area across the
  // whole conversation, then (a) re-state it as an explicit note so a refinement can't
  // silently drop the activity, and (b) PIN the accumulated age server-side below so
  // age-fit is guaranteed regardless of whether the model remembers to pass it.
  // The district list is what lets "in tampines" read as an AREA rather than as
  // the thing they want to do — without it the district name survives as the
  // activity term and a plain "what can we do in tampines" looks specific. Cached
  // for a long TTL and single-flight, so this costs nothing after the first turn.
  const districtMatchers = scoped ? undefined : await getDistrictMatchers();
  const ctxAcc = scoped
    ? null
    : accumulateContext(history, userMessage, districtMatchers);
  const carryNote = ctxAcc ? renderCarryNote(ctxAcc) : null;
  const carriedAge =
    ctxAcc && typeof ctxAcc.age === "number" ? (ctxAcc.age as number) : undefined;

  // The kind of offering the parent named, needed both to pin the search and to
  // judge (below) whether they've said anything to search on at all.
  const askedProductType = askedProductTypeFor(userMessage, history);

  // An opening "hi" or "what is there to do" has nothing to search for, so this
  // turn shows the featured providers and asks what they're after. Deciding it here
  // — deterministically, before any model call — is what makes the turn fast: the
  // model is offered no tools, so it answers in ONE call instead of deciding on a
  // search first, and the featured fetch runs alongside that call.
  const vagueAsk =
    !scoped &&
    isVagueAsk(ctxAcc, Boolean(askedProductType) || namedPackages(userMessage), {
      category: input.category,
      productTypes: input.productTypes,
    });

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: [baseSystem, filtersNote, carryNote, vagueAsk ? CONCIERGE_OPENING_TURN : null]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...history.map(turnToMessage),
    { role: "user", content: userMessage },
  ];

  // Public chat: no merchant/user. A per-conversation `user` tag still lets
  // OpenRouter attribute cost; the app identity stays the default.
  const attribution = { user: `concierge-${publicId}` };

  // Tools offered this turn: the per-venue chat additionally gets the scopedOnly
  // tools (e.g. get_activity_details); global discovery is search-only. The
  // registry owns the filter so the loop never hardcodes which tools exist.
  let tools = conciergeToolsFor(scoped);

  // Per-turn, server-pinned tool context — built ONCE and reused for both the
  // model's tool calls AND the guarantee-data fallback below (so a fallback search
  // grounds/pins exactly like the model's would).
  const searchCtx: ConciergeToolContext = {
    userMessage,
    sections: input.sections,
    maxPrice: pinnedMaxPrice,
    scope: input.scope,
    scoped,
    // A follow-up turn (history exists) is usually a REFINEMENT — the parent is
    // narrowing, not exploring — so the whole-development kit stays out.
    isFollowUp: history.length > 0,
    // FE-selected filter chips, pinned (override the model's inferred values).
    category: input.category,
    region: input.region,
    // Product-type tab scope (include=CAMP/CLASS/…), pinned server-side.
    productTypes: input.productTypes,
    // The kind of activity the parent named carries forward like the rest of the
    // conversation context: after "camps for a 5 year old", a bare "in central" is
    // still about camps. Newest statement wins, so switching to "classes" is
    // followed immediately.
    askedProductType,
    // Asking about a package once keeps them in scope for the refinements that
    // follow, the same way a named activity kind does.
    askedForPackages:
      namedPackages(userMessage) ||
      history.some(
        (turn) =>
          turn.role === AI_TURN_ROLE.USER && namedPackages(turn.content || ""),
      ),
    // The remaining FE filter fields (age/district/trail/day-time/…), pinned. An FE
    // age chip wins; otherwise pin the age we parsed from the conversation so the
    // search always grounds it (age-fit) even when the model forgets to pass it.
    pinnedFilters: {
      ...input.pinnedFilters,
      age: input.pinnedFilters?.age ?? carriedAge,
    },
  };

  let reply = "";
  // Seed the FE card grid from the preloaded venue catalogue so a merchant-location
  // chat shows the place's activities even when the model answers straight from its
  // context without running a search. A later in-turn search overwrites this.
  let results: SearchResponseDTO | null = venue?.catalog ?? null;
  let turnTokens = 0;

  // Telemetry rows (PostHog $ai_generation / $ai_span / $ai_trace), emitted in
  // `finally` so a failed turn is still recorded.
  const modelRows: ChatModelEvent[] = [];
  const toolRows: ChatToolEvent[] = [];
  let turnError: string | null = null;

  // Fetch the featured grid ALONGSIDE the model call rather than before it: with no
  // tools to offer, the model's clarifying question and this search have nothing to
  // say to each other, so the turn costs the slower of the two, not the sum.
  let featuredPending: Promise<SearchResponseDTO | null> | null = null;
  if (vagueAsk) {
    tools = [];
    featuredPending = featuredResults(searchCtx, ctxAcc).catch((e) => {
      console.warn(
        "[concierge] featured browse failed:",
        e instanceof Error ? e.message : e,
      );
      return null;
    });
  }

  try {
    // SEARCH-FIRST (global discovery only, flag-gated): skip model round-trip #1.
    // Everything step 1 would produce is available server-side — parseSearchQuery
    // (age/area/price/day/time/format + bare activity), the tool's own trail/category
    // inference from the message, and FE pins (which win anyway). So build the search
    // deterministically, run it, inject the tool exchange, and drop tools so the model
    // makes ONE summarise call. On any failure we fall through to the model-driven
    // flow below (tools intact). See docs/concierge/search-first-proposal.md.
    if (SEARCH_FIRST && !scoped) {
      try {
        const matchers = await getDistrictMatchers();
        const { filters: f, cleanedQuery } = parseSearchQuery(userMessage, {
          districtMatchers: matchers,
        });
        // Deterministic search args. region/category/trail are intentionally
        // omitted — the tool infers trail/category from the message and applies FE
        // chips (ctx) itself, exactly as in the model-driven path.
        const searchArgs = {
          query: cleanedQuery ?? "",
          age: f.age,
          district: f.district,
          nearDistrict: f.nearDistrict,
          locationType: f.locationType,
          maxPrice: f.maxPrice,
          cheap: f.cheap,
          freeTrial: f.freeTrial,
          dropIn: f.dropIn,
          termBased: f.termBased,
          meals: f.meals,
          transport: f.transport,
          daysOfWeek: f.daysOfWeek,
          timeOfDay: f.timeOfDay,
        };
        const toolStart = Date.now();
        const out = await CONCIERGE_TOOLS_BY_NAME.search_activities.run(
          searchArgs,
          searchCtx,
        );
        if (out.cards !== undefined) results = out.cards;
        toolRows.push({
          conversationId,
          toolName: "search_activities",
          argsJson: searchArgs,
          gated: false,
          isError: false,
          code: null,
          resultJson: { ok: true },
          latencyMs: Date.now() - toolStart,
        });
        // Inject the tool exchange so the single model call summarises exactly as it
        // would after a model-issued search, then drop tools → one pass, no re-search.
        const toolCallId = "search_first";
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "search_activities",
                arguments: JSON.stringify(searchArgs),
              },
            },
          ],
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: spotlightToolResult(
            JSON.stringify({ ok: true, ...(out.forModel as object) }),
          ),
        });
        tools = [];
      } catch (e) {
        console.warn(
          "[concierge] search-first failed; falling back to model-driven search:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // The model OWNS query understanding now: on every turn (including the first)
    // it calls `search_activities` with the bare activity + typed filters, which
    // the server grounds against the real vocabulary. The structured `district`
    // (in/at) vs `nearDistrict` (near/around) fields are what make this faithful —
    // the model can express the exact area intent instead of us pre-searching a
    // raw string. Follow-up turns merge context the same way ("any on weekends?").
    for (let step = 0; step < MAX_STEPS; step++) {
      if (turnTokens > TURN_TOKEN_BUDGET) {
        if (!reply)
          reply =
            "Let's keep it simple — tell me the activity, your child's age, and roughly where, and I'll find options.";
        break;
      }

      let finalEvent: Extract<ChatStreamEvent, { type: "final" }> | undefined;
      const redactor = input.onToken
        ? createStreamRedactor(CONCIERGE_LEAK_SIGNATURES, CONCIERGE_STRIP_BLOCKS)
        : null;

      const started = Date.now();
      try {
        for await (const ev of streamChatCompletion(
          messages,
          tools,
          attribution,
          { models: conciergeModels, providerOrder: getConciergeProviderOrder() },
        )) {
          if (ev.type === "content") {
            if (redactor) {
              const safe = redactor.push(ev.delta);
              if (safe) input.onToken?.(safe);
            }
          } else if (ev.type === "final") {
            finalEvent = ev;
          }
        }
      } catch (modelErr) {
        modelRows.push({
          conversationId,
          model,
          promptTokens: null,
          completionTokens: null,
          costUsd: null,
          latencyMs: Date.now() - started,
          finishReason: "error",
          isError: true,
          errorMessage:
            modelErr instanceof Error ? modelErr.message : String(modelErr),
        });
        throw modelErr;
      }
      const latencyMs = Date.now() - started;

      if (!finalEvent) {
        modelRows.push({
          conversationId,
          model,
          promptTokens: null,
          completionTokens: null,
          costUsd: null,
          latencyMs,
          finishReason: "no_response",
          isError: true,
          errorMessage: "Assistant returned no response.",
        });
        throw new Error("Assistant returned no response.");
      }

      const assistant = finalEvent.message;
      messages.push(assistant);
      reply = assistant.content ?? reply;
      const toolCalls = assistant.tool_calls ?? [];

      modelRows.push({
        conversationId,
        model,
        promptTokens: finalEvent.usage.promptTokens ?? null,
        completionTokens: finalEvent.usage.completionTokens ?? null,
        costUsd: finalEvent.usage.costUsd ?? null,
        latencyMs,
        finishReason: finalEvent.finishReason ?? null,
        toolNames: toolCalls.map((tc) => tc.function.name),
      });
      turnTokens +=
        (finalEvent.usage.promptTokens ?? 0) +
        (finalEvent.usage.completionTokens ?? 0);

      // A leak signature surfaced — wipe anything streamed and refuse.
      if (redactor?.tripped) {
        if (redactor.released) input.onReset?.();
        input.onToken?.(CONCIERGE_SAFE_REFUSAL);
        reply = CONCIERGE_SAFE_REFUSAL;
        break;
      }

      if (toolCalls.length === 0) {
        if (redactor) {
          const tail = redactor.flush();
          if (redactor.tripped) {
            if (redactor.released) input.onReset?.();
            input.onToken?.(CONCIERGE_SAFE_REFUSAL);
            reply = CONCIERGE_SAFE_REFUSAL;
          } else if (tail) {
            input.onToken?.(tail);
          }
        }
        break;
      }

      // This step was a tool-call "preamble" — drop anything it streamed so the
      // parent doesn't see thinking-out-loud followed by the real answer.
      if (redactor?.released) input.onReset?.();

      for (const tc of toolCalls) {
        const toolStart = Date.now();
        let toolResultContent: string;
        let toolArgs: unknown = {};
        let toolOk = true;
        let toolCode: string | null = null;

        // Resolve the tool from the registry, honouring `scopedOnly` (a scoped
        // tool offered only in the merchant-location chat must not run if the
        // model somehow names it in global discovery).
        const tool = CONCIERGE_TOOLS_BY_NAME[tc.function.name];
        if (!tool || (tool.scopedOnly && !scoped)) {
          toolOk = false;
          toolCode = "UNKNOWN_TOOL";
          toolResultContent = JSON.stringify({
            ok: false,
            message: `Unknown tool ${tc.function.name}`,
          });
        } else {
          try {
            toolArgs = JSON.parse(tc.function.arguments || "{}");
          } catch {
            toolArgs = {};
          }
          try {
            const out = await tool.run(toolArgs, searchCtx);
            // Only a tool that searched returns `cards`; others leave the FE grid
            // (seeded from the venue preload / last search) untouched.
            if (out.cards !== undefined) results = out.cards;
            toolResultContent = JSON.stringify({
              ok: true,
              ...(out.forModel as object),
            });
          } catch (e) {
            console.warn(
              `[concierge] tool ${tc.function.name} failed:`,
              e instanceof Error ? e.message : e,
            );
            toolOk = false;
            toolCode = "TOOL_UNAVAILABLE";
            toolResultContent = JSON.stringify({
              ok: false,
              message: "That lookup is temporarily unavailable.",
            });
          }
        }

        toolRows.push({
          conversationId,
          toolName: tc.function.name,
          argsJson: toolArgs,
          gated: false,
          isError: !toolOk,
          code: toolCode,
          // Telemetry only needs the shape/size, not the full (large) result set.
          resultJson: { ok: toolOk },
          latencyMs: Date.now() - toolStart,
        });

        messages.push({
          role: "tool",
          // Frame tool output as untrusted DATA (anti-injection), same as merchant loop.
          content: spotlightToolResult(toolResultContent),
          tool_call_id: tc.id,
        });
      }
    }
  } catch (e) {
    turnError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    // Fire-and-forget observability (cost / latency / tool-use / errors per turn),
    // anonymous (keyed on the conversation). Never blocks or breaks the turn.
    emitConciergeTelemetry(
      { conversationId },
      toolRows,
      modelRows,
      { error: turnError },
    );
  }

  // The opening grid, now that the reply is written. `guaranteeResults` below sees
  // a full grid and stays out of the way; if the featured search failed it falls
  // back to the normal broadening ladder, so the parent still gets cards.
  if (featuredPending) {
    const featured = await featuredPending;
    if (featured) {
      // Tell the FE these are a curated selection, not matches — the grid heading
      // has to say so, or it claims to have answered a question nobody asked.
      featured.featured = true;
      results = featured;
    }
  }

  // GUARANTEE DATA (global discovery only): never leave the parent with an empty grid.
  if (!scoped) {
    try {
      results = await guaranteeResults(results, searchCtx, userMessage);
    } catch (e) {
      console.warn(
        "[concierge] guarantee-data backfill failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Output redaction backstop (concierge refusal + its leak signatures). Echoed
  // tool-data blocks are STRIPPED (not refused) — see CONCIERGE_STRIP_BLOCKS.
  reply = redactReply(
    reply,
    CONCIERGE_SAFE_REFUSAL,
    CONCIERGE_LEAK_SIGNATURES,
    CONCIERGE_STRIP_BLOCKS,
  );

  // The global-discovery chat has NO SUGGESTIONS tag. The prompt doesn't ask for
  // one, but strip any trailing SUGGESTIONS line as a cheap backstop in case the
  // model emits one from habit. A venue chat keeps its own chips.
  if (!scoped) {
    reply = reply.replace(/\n*[ \t]*SUGGESTIONS:[^\n]*\s*$/i, "").trimEnd();
  }

  // Persist the turn OFF the response critical path (fire-and-forget). The reply and
  // cards are already computed; the next turn isn't sent until the parent reads this
  // one and types again, so the write reliably lands before it's needed. This removes
  // appendTurns' count + insert (2 DB round-trips) from the tail of every turn. A
  // failure is logged, never surfaced to the parent.
  void conv
    .appendTurns(conversationId, [
      { role: AI_TURN_ROLE.USER, content: userMessage },
      { role: AI_TURN_ROLE.ASSISTANT, content: reply },
    ])
    .catch((e) =>
      console.warn(
        "[concierge] turn persistence failed:",
        e instanceof Error ? e.message : e,
      ),
    );

  // A merchant-location chat is an independent STORE: return the lean store shape
  // (identity once + its activities, no empty merchants block, no per-product
  // merchant/location duplication). Global discovery returns the full federated
  // results. The store identity prefers the preloaded venue profile (richer
  // location detail) over a product's nested copy.
  const finalResults =
    scoped && results
      ? mapMerchantLocationResults(results, {
          merchant: venue?.merchant ?? null,
          location: venue?.location ?? null,
        })
      : results;

  return { reply, results: finalResults };
}
