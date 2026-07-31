import { LruTtlCache } from "../../../lib/cache/lruTtlCache";
import { ServiceLocator } from "../../../services";
import { SearchResponseDTO } from "../../../shared/dtos/SearchDTOs";
import { CONCIERGE_TOOLS_BY_NAME } from "./tools/registry";
import { ConciergeToolContext } from "./tools/types";

/**
 * The curated shortlist changes only when a platform admin edits it, but it is read
 * on every vague turn — so hold it briefly rather than querying each time. The TTL
 * is short because it doubles as how long an admin waits to see their edit take
 * effect.
 */
const featuredIdsCache = new LruTtlCache<number[]>({
  max: 1,
  ttlMs: Number(process.env.CONCIERGE_FEATURED_IDS_TTL_MS || 60_000),
});

/**
 * The providers a parent is shown before they've told us anything, curated by a
 * platform admin. Chosen by hand rather than by whatever relevance returns for an
 * empty query — an opening grid is the platform's shop window.
 */
async function featuredMerchantIds(): Promise<number[]> {
  return featuredIdsCache.getOrLoad("featured", () =>
    ServiceLocator.MerchantService.internal.findFeaturedMerchantIds(),
  );
}

/**
 * Words that carry no search intent on their own — greetings, politeness, and the
 * scaffolding of a generic ask ("show me some things to do for the kids"). A
 * message made only of these has told us nothing to search for.
 */
const GENERIC_ASK_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "with", "in", "on", "at",
  "is", "are", "any", "some", "something", "anything", "thing", "things", "stuff",
  "this", "that", "these", "those", "here", "now", "today", "tomorrow", "next",
  "hi", "hii", "hey", "hello", "hiya", "yo", "morning", "afternoon", "evening",
  "good", "thanks", "thank", "please", "ok", "okay",
  "i", "im", "we", "us", "me", "my", "our", "you", "your",
  "show", "give", "tell", "find", "looking", "look", "want", "need", "help",
  "what", "whats", "which", "where", "can", "could", "would", "do", "does",
  "idea", "ideas", "suggest", "suggestion", "suggestions", "recommend",
  "recommendation", "recommendations", "option", "options", "list",
  "fun", "nice", "cool", "best", "great", "popular", "interesting",
  "kid", "kids", "child", "children", "family", "families", "there", "out",
]);

/**
 * True when the parent hasn't told us anything to search on — a greeting, or a
 * generic "what is there to do". Deterministic and cheap, so it can run before the
 * model does and save the turn a whole round-trip. Anything the parent actually
 * named — an activity word, an age, an area, a budget, a product kind, or a filter
 * chip from the page — makes the ask specific and takes this path out of play.
 */
export function isVagueAsk(
  accumulatedContext: Record<string, unknown> | null,
  namedAnOfferingKind: boolean,
  pins: { category?: string | string[]; productTypes?: unknown[] },
): boolean {
  if (namedAnOfferingKind) return false;

  // A topic or type chip IS the request — "Swimming" or the Camps tab says what
  // they want. An age, area or budget only says who and where, which narrows a
  // featured browse rather than replacing it.
  if (pins.category?.length || pins.productTypes?.length) return false;

  const words = String(accumulatedContext?.activity ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.every((word) => GENERIC_ASK_WORDS.has(word));
}

/**
 * What the parent has told us about WHO and WHERE, as search arguments. A vague
 * ask can still carry a real constraint — "something fun in central", "things to
 * do for a 4 year old" — and ignoring it would answer a question they didn't ask.
 */
const CONSTRAINT_FIELDS = [
  "age",
  "region",
  "district",
  "nearDistrict",
  "maxPrice",
  "locationType",
  "daysOfWeek",
  "timeOfDay",
  "cheap",
  "freeTrial",
  "meals",
  "transport",
] as const;

function statedConstraints(
  accumulatedContext: Record<string, unknown> | null,
): Record<string, unknown> {
  const constraints: Record<string, unknown> = {};
  for (const field of CONSTRAINT_FIELDS) {
    const value = accumulatedContext?.[field];
    if (value != null) constraints[field] = value;
  }
  return constraints;
}

/**
 * The featured grid is the same rows for everyone until the parent narrows things
 * down, so it is fetched once and reused. Without this every "hi" would pay for a
 * live search; with it, only the first one in each TTL window does.
 */
const featuredCache = new LruTtlCache<SearchResponseDTO | null>({
  max: Number(process.env.CONCIERGE_FEATURED_CACHE_MAX || 8),
  ttlMs: Number(process.env.CONCIERGE_FEATURED_CACHE_TTL_MS || 300_000),
});

/** Test-only: drop the featured caches so cases don't bleed into each other. */
export function _resetFeaturedCache(): void {
  featuredCache.clear();
  featuredIdsCache.clear();
}

/**
 * The opening grid for a parent who hasn't said what they want: a browse limited to
 * the featured providers, honouring any age or area they did mention. Runs through
 * the normal search tool so the cards, hydration and section handling are identical
 * to every other turn — only the provider shortlist differs.
 *
 * Falls back to the unconstrained shortlist when a constraint leaves it empty: a
 * parent asking for central deserves a full shop window over an empty one, and the
 * reply asks what they're after either way.
 */
export async function featuredResults(
  ctx: ConciergeToolContext,
  accumulatedContext: Record<string, unknown> | null,
): Promise<SearchResponseDTO | null> {
  const merchantIds = await featuredMerchantIds();
  // Nobody curated yet (or the admin emptied the list) — fall through to the
  // normal empty-grid backfill rather than inventing a shop window.
  if (!merchantIds.length) return null;

  const constraints = statedConstraints(accumulatedContext);
  // The tab, the parent's constraints and the shortlist itself all change the
  // rows, so all three key the cache — otherwise "in central" would be served
  // someone else's whole-island grid, and an admin's edit would sit behind a
  // stale result set until this cache expired too.
  const cacheKey = `${(ctx.sections ?? []).join(",") || "all"}|${JSON.stringify(constraints)}|${merchantIds.join(",")}`;

  return featuredCache.getOrLoad(cacheKey, async () => {
    const browse = async (args: Record<string, unknown>) => {
      const out = await CONCIERGE_TOOLS_BY_NAME.search_activities.run(
        { query: "", ...args },
        {
          ...ctx,
          merchantIds,
          // Nothing was named, so nothing inferred from the wording should narrow
          // the shortlist — only what the parent actually stated, passed as args.
          userMessage: "",
          category: undefined,
          askedProductType: null,
        },
      );
      return out.cards ?? null;
    };

    const constrained = await browse(constraints);
    if (!Object.keys(constraints).length || countsCards(constrained)) {
      return constrained;
    }
    return browse({});
  });
}

/** Whether a search came back with anything to show. */
function countsCards(results: SearchResponseDTO | null): boolean {
  if (!results) return false;
  return (
    (results.products?.total ?? 0) +
      (results.merchants?.total ?? 0) +
      (results.packages?.total ?? 0) >
    0
  );
}
