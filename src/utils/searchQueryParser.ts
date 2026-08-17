import { LOCATION_TYPE, PRODUCT_TYPE, SG_REGIONS } from "@prisma/client";

/**
 * Heuristic natural-language search parser. Pure and dependency-free (no DB, no
 * network): it lifts the *hard* filters a user typed in plain English ("5 year
 * old", "outdoor", "central") out of a free-text query so they can be passed to
 * Typesense as structured `filter_by` clauses. The full raw sentence is still
 * sent as the `q` for hybrid (keyword + embedding) matching — the parser only
 * extracts, it never rewrites the query.
 *
 * ENUM-DERIVED, NOT HARDCODED: the matching vocabulary for `region` and
 * `locationType` is computed at module load directly from the Prisma enums
 * (`SG_REGIONS`, `LOCATION_TYPE`). There is no hand-maintained gazetteer or
 * keyword list — adding/removing an enum value automatically changes what the
 * parser matches. Only `age` keeps a regex, because it's a natural-language
 * number pattern, not enum data.
 *
 * DATA-DRIVEN DISTRICT: `district` (an SG planning-area name like "Tampines")
 * is NOT enum data — its vocabulary is the distinct `Location.sgDistrict` values
 * in the DB. To keep this module pure (no DB, no network), the caller INJECTS
 * those matchers via `opts.districtMatchers` (built with `buildDistrictMatchers`
 * from a DB-derived value list). There is still no hardcoded gazetteer here.
 *
 * Everything is best-effort: an unrecognized phrase simply yields no filter for
 * that dimension and the embedding handles the nuance.
 */

export type ParsedSearchQuery = {
  age?: number;
  // region/category/productType are MULTI-VALUE on the concierge path (any-of /
  // OR within the filter); the NL parser still sets a single region string. Both
  // the product and merchant filter builders accept scalar OR array.
  region?: string | string[];
  locationType?: string;
  // Activity category → exact facet on the product's denormalized
  // `merchantCategories` (the merchant's category names). Set only by the
  // concierge's grounded `category` chips; the NL parser doesn't lift it.
  category?: string | string[];
  // Explorer Map developmental trail(s), matched against both primary and
  // "also builds" activity metadata. Set by the concierge's structured tool.
  trail?: string | string[];
  // Product type (CLASS/CAMP/BIRTHDAY/DROP_IN/EVENT) when the concierge's
  // category chips map to one (Camps→CAMP, Birthdays→BIRTHDAY).
  productType?: string | string[];
  // Exact planning-area match ("in tampines" → only Tampines locations). Several
  // when one word names a family of areas ("bukit" → four planning areas): the
  // search ORs them, so the parent sees all of what they asked for.
  district?: string | string[];
  // Proximity intent ("near tampines", "around orchard"): the user wants things
  // CLOSE TO that area, not strictly inside it. Carried separately from
  // `district` so the search layer can switch to distance-based ranking
  // (geo-sort from the district's centroid) instead of an exact area filter.
  // The two are mutually exclusive — a given district phrase is classified as
  // one or the other by whether a proximity preposition precedes it.
  nearDistrict?: string;

  // --- price + format/amenity intents (matched against the denormalized
  // product facets; see the products collection) ---
  // Budget ceiling from "under $200" / "below 100" / "less than $50".
  maxPrice?: number;
  // "cheap" / "budget" / "affordable" → rank cheapest first (price sort).
  cheap?: boolean;
  freeTrial?: boolean; // "free trial" / "trial class"
  dropIn?: boolean; // "drop-in"
  termBased?: boolean; // "term-based" / "termly"
  meals?: boolean; // "with meals" / "meals included"
  transport?: boolean; // "with transport" / "bus included"

  // Day-of-week ints (0=Sun..6=Sat) from "weekend" / "weekday" / day names.
  daysOfWeek?: number[];
  // Time-of-day bucket from "morning" / "afternoon" / "evening".
  timeOfDay?: string;
};

/**
 * Result of parsing: the structured hard `filters` lifted out of the query, and
 * the `cleanedQuery` — the original text with every consumed phrase (age, region,
 * district, locationType) AND search stopwords removed. The cleaned text is what
 * goes to the search engine for BOTH keyword and embedding matching: keeping the
 * consumed phrases would double-count them (already hard filters) and dilute
 * matching (e.g. "5 years old" drags the embedding toward generic young-kid
 * camps, washing out the real intent like "music"). See SEARCH_STOPWORDS for why
 * grammatical + format words are dropped too.
 */
export type SearchQueryParseResult = {
  filters: ParsedSearchQuery;
  cleanedQuery: string;
};

// --- stopwords -------------------------------------------------------------
// Standard IR stopwords, applied to the residual query AFTER the hard filters
// (age/region/district/locationType) are stripped, so only the real *intent*
// (the activity) reaches keyword + embedding matching. Two groups:
//
//  1. Grammatical function words — carry no search signal ("yoga FOR MY kid").
//  2. Generic format/offering words — every product is a "camp/class/lesson",
//     so they match nothing useful and actively dilute: "yoga camps" would
//     otherwise keyword-match every camp NAME and pull generic camps into the
//     vector neighbourhood. Dropping them makes "yoga camps" search "yoga"
//     (→ precise) while "swimming camp" still searches "swimming". Note this is
//     deliberately conservative — we keep meaningful words like "holiday",
//     "session", "drop-in" that signal a real product flavour.
//
// This is the IR-standard form of the "no hardcoded gazetteer" rule: a small,
// universal stopword set, NOT a domain vocabulary mapping. Done here (not via
// Typesense native stopwords) so the cleaned text also drives the EMBEDDING —
// native stopwords would only clean the keyword half, leaving the vector diluted.
const SEARCH_STOPWORDS = new Set<string>([
  // grammatical
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "with",
  "my", "me", "your", "our", "by", "from", "all", "any",
  "some", "i", "am", "looking", "want", "need", "find", "show", "is", "are",
  // proximity prepositions — carry no activity signal; the proximity INTENT is
  // already captured into `nearDistrict` before stopwording runs.
  "near", "nearby", "nearest", "around", "close", "closest",
  // vague-discovery filler ("things near tanglin", "fun stuff for kids") — no
  // discriminating signal on a kids-activity catalogue, so they only dilute.
  "things", "thing", "stuff", "something", "anything", "everything",
  // platform-universal filler — every product here is for a child and is
  // something to "learn/do", so these words carry no discriminating signal and
  // only dilute conversational queries ("i want my kid to learn to swim" must
  // search "swim", not "kid learn swim"). Age nuance words (toddler, preschooler)
  // are deliberately kept — the embedding uses them.
  "kid", "kids", "child", "children", "learn", "learning", "do",
  // generic format / offering words
  "camp", "camps", "class", "classes", "lesson", "lessons", "course",
  "courses", "program", "programs", "programme", "programmes", "activity",
  "activities",
]);

// --- age -------------------------------------------------------------------
// First "<n> years/yrs/yo/year-old" occurrence, clamped to a child-plausible
// 0–18. ("toddler"/"preschooler" are intentionally ignored — too fuzzy for a
// hard filter; the embedding handles them.) This is the only non-enum matcher:
// it's a natural-language number pattern, not data.
//
// It must match the WHOLE phrase ("5 years old", "5-year-old", "5 yo") so the
// whole thing can be stripped from the search text — a leftover "old" would
// pollute matching. The trailing `(?:[-\s]?old)?` swallows the optional "old".
const AGE_RE = /(\d{1,2})[-\s]*(?:y\/?o|yrs?|years?)(?:[-\s]?old)?\b/i;

// --- price + format/amenity intent patterns ------------------------------
// These are fixed natural-language patterns (like AGE_RE), not domain/place
// data — they recognise how a parent phrases a budget or a format preference,
// and map it onto a denormalized product facet. Each matched phrase is stripped
// from the query so it doesn't leak into keyword/embedding matching.
//
// Budget ceiling: "under $200", "below 100", "less than $50", "max 80",
// "up to $120", "within 150". Captures the number. `\d+` (any length) so an
// out-of-range amount still parses cleanly instead of leaking the "under $N"
// text into the search (a huge ceiling is simply a no-op filter).
const PRICE_MAX_RE =
  /\b(?:under|below|less\s+than|max(?:imum)?|up\s?to|within|cheaper\s+than)\s*\$?\s*(\d+)\b/i;
// "cheap" intent → sort by price ascending (no explicit ceiling).
const CHEAP_RE = /\b(?:cheap(?:est)?|budget|affordable|low[\s-]?cost|inexpensive)\b/i;
// Format / amenity flags. Order them before stopwording so multi-word phrases
// ("free trial", "with meals") are consumed whole.
const FREE_TRIAL_RE = /\b(?:free\s+trial|trial\s+class(?:es)?|trial)\b/i;
const DROP_IN_RE = /\bdrop[\s-]?in\b/i;
const TERM_BASED_RE = /\b(?:term[\s-]?based|termly)\b/i;
const MEALS_RE = /\b(?:with\s+meals?|meals?\s+included|lunch\s+included|with\s+lunch|meals?)\b/i;
const TRANSPORT_RE =
  /\b(?:with\s+transport|transport\s+included|bus\s+(?:service|included)|with\s+bus|transport)\b/i;
// Day-of-week + time-of-day (matched against the denormalized daysOfWeek /
// timeOfDay facets). Day ints follow JS getDay (0=Sun..6=Sat).
const WEEKEND_RE = /\bweekends?\b/i;
const WEEKDAY_RE = /\bweekdays?\b/i;
const DAY_NAME_RES: Array<[RegExp, number]> = [
  [/\bsundays?\b/i, 0],
  [/\bmondays?\b/i, 1],
  [/\btuesdays?\b/i, 2],
  [/\bwednesdays?\b/i, 3],
  [/\bthursdays?\b/i, 4],
  [/\bfridays?\b/i, 5],
  [/\bsaturdays?\b/i, 6],
];
const MORNING_RE = /\bmornings?\b/i;
const AFTERNOON_RE = /\bafternoons?\b/i;
const EVENING_RE = /\bevenings?\b/i;

// A compiled phrase→value matcher. Used for both the enum-derived dimensions
// (region/locationType) and the DB-derived district vocabulary.
export type PhraseMatcher = { re: RegExp; value: string | string[] };

const escapeForRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build the word-boundary match variants for one enum value, computed purely
 * from the value string. For an underscore-joined value (`NORTH_EAST`) this
 * yields the lowercased forms "north east" (space), "northeast" (joined) and
 * "north-east" (hyphen); a single-token value (`EAST`, `CENTRAL`, `INDOOR`)
 * collapses all transforms to its own lowercased form. Variants are de-duped.
 */
const variantsForEnumValue = (value: string): string[] => {
  const lower = value.toLowerCase();
  return Array.from(
    new Set([
      lower, // as-is, e.g. "north_east"
      lower.replace(/_/g, " "), // "north east"
      lower.replace(/_/g, ""), // "northeast"
      lower.replace(/_/g, "-"), // "north-east"
    ]),
  );
};

const matcherForEnumValue = (value: string): PhraseMatcher => {
  const alternation = variantsForEnumValue(value).map(escapeForRegex).join("|");
  return { re: new RegExp(`\\b(?:${alternation})\\b`, "i"), value };
};

// --- region (enum-derived) -------------------------------------------------
// One matcher per SG_REGIONS value, derived from the value strings. Compound
// (underscore-containing) values are tested BEFORE single-token ones so a query
// like "north east" resolves to NORTH_EAST rather than being captured by the
// bare "north"/"east" matchers. A stable partition on `.includes("_")`
// preserves enum order within each group while putting compounds first.
const REGION_MATCHERS: PhraseMatcher[] = (() => {
  const values = Object.values(SG_REGIONS);
  const compound = values.filter((v) => v.includes("_"));
  const simple = values.filter((v) => !v.includes("_"));
  return [...compound, ...simple].map(matcherForEnumValue);
})();

// --- locationType (enum-derived) -------------------------------------------
// Match only INDOOR / OUTDOOR (BOTH is intentionally ignored — it's not a
// user-typed intent, it's a venue capability). Derived from LOCATION_TYPE so
// the set follows the enum.
const LOCATION_TYPE_MATCHERS: PhraseMatcher[] = Object.values(LOCATION_TYPE)
  .filter((v) => v === "INDOOR" || v === "OUTDOOR")
  .map(matcherForEnumValue);

// --- offering / format words (ENUM-DERIVED, not hardcoded) -----------------
// The generic words that name a product's FORMAT rather than its activity —
// "camp", "class", "drop in", "event", "birthday" — carry no activity signal, so
// when a query term still contains them ("swimming camps") they dilute matching
// (the keyword half matches every camp NAME; the embedding drifts toward generic
// camps). We strip them from the term so "swimming camps" searches "swimming".
//
// The vocabulary is DERIVED from the PRODUCT_TYPE enum (same pattern as the
// region/locationType matchers) — add/remove a product type and this follows,
// with NO hand-maintained word list. Each value yields its space/hyphen/joined
// variants (for `DROP_IN` → "drop in"/"drop-in"/"dropin") and a naive plural.
const pluralize = (w: string): string =>
  /(?:s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`;

const OFFERING_STOPWORDS: Set<string> = (() => {
  const out = new Set<string>();
  for (const value of Object.values(PRODUCT_TYPE)) {
    for (const form of variantsForEnumValue(value)) {
      out.add(form);
      out.add(pluralize(form));
    }
  }
  return out;
})();

const OFFERING_RES: RegExp[] = [...OFFERING_STOPWORDS]
  // Longest first so a multi-word form ("drop in") is consumed before its parts.
  .sort((a, b) => b.length - a.length)
  .map((w) => new RegExp(`\\b${escapeForRegex(w)}\\b`, "gi"));

/**
 * Strip the enum-derived offering/format words from a query TERM, leaving the
 * bare activity. Used by the concierge's structured path as a deterministic
 * safety net when the model leaves a format word in (e.g. "swimming camps" →
 * "swimming"). Returns "" when nothing but format words remained (→ the caller
 * treats an empty term as a wildcard browse). Pure and dependency-light.
 */
export function stripOfferingWords(text: string): string {
  let s = ` ${(text ?? "").toLowerCase()} `;
  for (const re of OFFERING_RES) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").trim();
}

// --- district (DB-derived, injected) ---------------------------------------
// The literal sentinel `Location.sgDistrict` uses for "no known district". It's
// data junk, not a place — one documented sentinel, NOT a hardcoded gazetteer.
// Exported so the DB-driven vocabulary/centroid loader uses the same value
// instead of re-declaring it.
export const DISTRICT_SENTINEL = "Unknown";

/**
 * Build district phrase matchers from a list of distinct `Location.sgDistrict`
 * values (loaded from the DB by the caller — this stays pure). For each kept
 * value we compile a word-boundary, case-insensitive regex of its lowercased
 * form, so multi-word names ("Jurong East") match as a phrase.
 *
 * Two values are dropped:
 *  - empty/null and the `Unknown` sentinel (data junk).
 *  - any value that IS a region word — i.e. a region matcher matches the WHOLE
 *    value (e.g. the "Central" district is itself the CENTRAL region word). Such
 *    values are left to the region parser. A value that merely CONTAINS a region
 *    word ("Jurong East" contains "east") is kept — it's a distinct place. The
 *    collision set is DERIVED from REGION_MATCHERS, not hardcoded.
 *
 * Matchers are sorted LONGEST value first so a longer phrase ("Jurong East")
 * wins over any shorter name it contains, and multi-word phrases are tried
 * before single words.
 */
export function buildDistrictMatchers(
  districtValues: string[],
): PhraseMatcher[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of districtValues) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    if (value === DISTRICT_SENTINEL) continue;

    const lower = value.toLowerCase();
    if (seen.has(lower)) continue;

    // Region collision: drop only values that ARE a region word (the matcher
    // consumes the whole value), not values that merely contain one. Derived
    // from the existing region matchers, not a hardcoded list.
    const isRegionWord = REGION_MATCHERS.some((m) => {
      const match = lower.match(m.re);
      return match !== null && match[0] === lower;
    });
    if (isRegionWord) continue;

    seen.add(lower);
    kept.push(value);
  }

  // A word that several areas share ("bukit" → Bukit Timah / Merah / Batok /
  // Panjang; "jurong" → East / West) is a real thing to ask for. Without this the
  // phrase matches no area at all, the word falls through to free text, and the
  // model picks ONE of them — so a parent asking for "bukit" is answered from a
  // quarter of the catalogue and told it is the answer. Families of one are left
  // out: the exact matcher already covers those.
  const families = new Map<string, string[]>();
  for (const value of kept) {
    const [head, ...rest] = value.split(/\s+/);
    if (!rest.length) continue; // single-word area — exact match is enough
    const key = head.toLowerCase();
    families.set(key, [...(families.get(key) ?? []), value]);
  }

  const exact: PhraseMatcher[] = kept.map((value) => ({
    re: new RegExp(`\\b${escapeForRegex(value.toLowerCase())}\\b`, "i"),
    value,
  }));
  const familyMatchers: PhraseMatcher[] = [...families.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key, values]) => ({
      re: new RegExp(`\\b${escapeForRegex(key)}\\b`, "i"),
      value: values,
    }));

  // Longest phrase first, so "bukit timah" beats the "bukit" family and a parent who
  // named one area gets exactly that one.
  return [...exact, ...familyMatchers].sort((a, b) => {
    const len = (m: PhraseMatcher) =>
      Array.isArray(m.value) ? m.value[0].split(/\s+/)[0].length : m.value.length;
    return len(b) - len(a);
  });
}

// Returns the matched value AND the query with the matched phrase removed, so a
// matched phrase (e.g. a district's embedded region word) can't be re-matched by
// a later dimension, and so the leftover becomes the cleaned search query.
const firstMatchAndStrip = (
  q: string,
  matchers: PhraseMatcher[],
): { value?: string | string[]; rest: string } => {
  for (const { re, value } of matchers) {
    const m = q.match(re);
    if (m) {
      const at = m.index ?? 0;
      return { value, rest: `${q.slice(0, at)} ${q.slice(at + m[0].length)}` };
    }
  }
  return { rest: q };
};

// Like firstMatchAndStrip but exposes WHERE the match landed, so the caller can
// inspect the text immediately before it (to detect a proximity preposition).
const firstMatchAt = (
  q: string,
  matchers: PhraseMatcher[],
): { value: string | string[]; index: number; length: number } | null => {
  for (const { re, value } of matchers) {
    const m = q.match(re);
    if (m) return { value, index: m.index ?? 0, length: m[0].length };
  }
  return null;
};

// A proximity preposition sitting at the END of the text just before a matched
// district phrase → the user means "close to" that district, not "inside" it.
// Covers near / nearby / nearest / around / close[ to|by] / closest[ to|by] /
// next to. Derived as a fixed grammatical pattern (like AGE_RE), not place data.
const PROXIMITY_BEFORE_RE =
  /\b(?:near(?:by|est)?|around|close(?:st)?(?:\s+(?:to|by))?|next\s+to)\s+$/i;

export function parseSearchQuery(
  raw: string,
  opts?: { districtMatchers?: PhraseMatcher[] },
): SearchQueryParseResult {
  const filters: ParsedSearchQuery = {};
  // Single working string that every matcher strips from, so what's left at the
  // end is the cleaned query (the residue after all consumed phrases removed).
  let work = (raw ?? "").toLowerCase();

  // age — strip the whole matched phrase (regex swallows the trailing "old").
  // Always strip so the phrase can't pollute the search text; but only KEEP it
  // as a filter when it's in the kids range (0–18). An out-of-range age like
  // "50 year old" is a mistake / non-kid query — drop the filter rather than
  // silently clamping to 18 (which would impose a wrong age band).
  const ageMatch = work.match(AGE_RE);
  if (ageMatch) {
    const years = Number(ageMatch[1]);
    if (years >= 0 && years <= 18) filters.age = years;
    const at = ageMatch.index ?? 0;
    work = `${work.slice(0, at)} ${work.slice(at + ageMatch[0].length)}`;
  }

  // Match district BEFORE region: a district whose name contains a region word
  // (e.g. "Jurong East", which is in the WEST region) must NOT also set
  // region=EAST and contradict itself. Stripping the district phrase first
  // leaves region to match only on what remains. The district vocabulary is the
  // injected, DB-derived set (data-driven).
  //
  // Proximity vs exact: if a proximity preposition immediately precedes the
  // matched district ("near tampines"), classify it as `nearDistrict` (→ the
  // search layer ranks by distance from the area's centroid); otherwise it's an
  // exact `district` ("in tampines"). Either way the district phrase (and the
  // proximity word, when present) is stripped from the residue so it can't
  // re-match region and doesn't leak into the cleaned query.
  if (opts?.districtMatchers?.length) {
    const hit = firstMatchAt(work, opts.districtMatchers);
    if (hit) {
      const before = work.slice(0, hit.index);
      const prox = before.match(PROXIMITY_BEFORE_RE);
      const after = work.slice(hit.index + hit.length);
      if (prox) {
        // "near X" ranks by distance from ONE centroid, so a family of areas has no
        // single point to measure from. Treat it as an exact multi-area search
        // instead of silently measuring from one of them.
        if (Array.isArray(hit.value)) filters.district = hit.value;
        else filters.nearDistrict = hit.value;
        work = `${before.slice(0, prox.index ?? before.length)} ${after}`;
      } else {
        filters.district = hit.value;
        work = `${before} ${after}`;
      }
    }
  }

  {
    // Collect every locationType word present. If BOTH indoor and outdoor are
    // named ("indoor outdoor swimming") the user means "either", so we strip
    // both words and apply NO locationType filter (show all); a single match
    // applies that type. Either way the matched words are stripped so they don't
    // leak into the cleaned query.
    const matched = LOCATION_TYPE_MATCHERS.map((m) => {
      const hit = work.match(m.re);
      return hit ? { value: m.value, index: hit.index ?? 0, length: hit[0].length } : null;
    }).filter((x): x is { value: string; index: number; length: number } => x !== null);

    if (matched.length === 1) filters.locationType = matched[0].value;
    // Strip right-to-left so earlier indices stay valid.
    for (const { index, length } of [...matched].sort((a, b) => b.index - a.index)) {
      work = `${work.slice(0, index)} ${work.slice(index + length)}`;
    }
  }

  {
    const { value, rest } = firstMatchAndStrip(work, REGION_MATCHERS);
    if (value) {
      filters.region = value;
      work = rest;
    }
  }

  // price + format/amenity intents — detect, set the filter, and strip the
  // matched phrase so it never reaches keyword/embedding matching. `detectFlag`
  // strips the first match of `re` and reports whether it fired.
  const detectFlag = (re: RegExp): boolean => {
    const m = work.match(re);
    if (!m) return false;
    const at = m.index ?? 0;
    work = `${work.slice(0, at)} ${work.slice(at + m[0].length)}`;
    return true;
  };

  const priceMatch = work.match(PRICE_MAX_RE);
  if (priceMatch) {
    filters.maxPrice = Number(priceMatch[1]);
    const at = priceMatch.index ?? 0;
    work = `${work.slice(0, at)} ${work.slice(at + priceMatch[0].length)}`;
  }
  if (detectFlag(CHEAP_RE)) filters.cheap = true;
  if (detectFlag(FREE_TRIAL_RE)) filters.freeTrial = true;
  if (detectFlag(DROP_IN_RE)) filters.dropIn = true;
  if (detectFlag(TERM_BASED_RE)) filters.termBased = true;
  if (detectFlag(MEALS_RE)) filters.meals = true;
  if (detectFlag(TRANSPORT_RE)) filters.transport = true;

  // day-of-week — "weekend"/"weekday" expand to their day sets; explicit day
  // names add individually. Matched phrases are stripped.
  const days = new Set<number>();
  if (detectFlag(WEEKEND_RE)) [0, 6].forEach((d) => days.add(d));
  if (detectFlag(WEEKDAY_RE)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  for (const [re, n] of DAY_NAME_RES) if (detectFlag(re)) days.add(n);
  if (days.size) filters.daysOfWeek = [...days].sort((a, b) => a - b);

  // time-of-day — first bucket wins (a query rarely names two).
  if (detectFlag(MORNING_RE)) filters.timeOfDay = "morning";
  else if (detectFlag(AFTERNOON_RE)) filters.timeOfDay = "afternoon";
  else if (detectFlag(EVENING_RE)) filters.timeOfDay = "evening";

  // Drop stopwords from the residue so only the real intent reaches matching.
  const cleanedQuery = work
    .split(/\s+/)
    .filter((token) => token && !SEARCH_STOPWORDS.has(token))
    .join(" ");

  return { filters, cleanedQuery };
}

//////////////////////////////
// Retractions
//////////////////////////////

/**
 * Every filter key carried across a conversation. Named here so the accumulator and
 * a "start over" clear the same set — two hand-maintained lists would drift, and a
 * key missing from one of them is a filter the parent cannot get rid of.
 */
/**
 * Question and refinement words the stopword set above deliberately keeps — on a
 * one-shot search they are harmless noise, and they only matter when deciding
 * whether a follow-up NAMED a new activity or merely narrowed the existing one.
 */
const REFINEMENT_FILLER = new Set([
  "what", "whats", "about", "how", "there", "else", "other", "others", "more",
  "got", "have", "has", "available", "option", "options", "one", "ones", "please",
  "you", "do", "does", "can", "could", "would", "any", "anything", "some", "we",
  "cheaper", "cheapest", "closer", "nearer", "better", "bigger", "smaller",
  "earlier", "later", "sooner", "affordable",
  // discourse framing around a refinement ("somewhere closer to home",
  // "actually, X instead") — none of it names a thing to do
  "somewhere", "anywhere", "actually", "instead", "rather", "maybe",
  "perhaps", "prefer", "home", "place", "places", "area", "areas",
]);

/**
 * The activity a message NAMES, reduced to its substantive words — or null when it
 * names none.
 *
 * A refinement leaves residue once its filter words are consumed: "any in the east?"
 * reduces to "?" and "what about gymnastics?" to "what about gymnastics?". Treating
 * the first as an activity replaces the one the parent established; searching the
 * second verbatim looks for that whole sentence. Returning "gymnastics" and null
 * respectively is what makes the carried activity safe to search with.
 */
export function namesAnActivity(text: string | undefined | null): string | null {
  const substantive = (text ?? "")
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 1 && !REFINEMENT_FILLER.has(word.toLowerCase()));
  return substantive.length ? substantive.join(" ") : null;
}

export const CARRIED_FILTER_KEYS = [
  "activity",
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
] as const;

export type CarriedFilterKey = (typeof CARRIED_FILTER_KEYS)[number];

/** "start over" and friends: the parent wants a clean slate, not one filter dropped. */
const RESET_PHRASES =
  /\b(?:start over|start again|start from scratch|reset|forget everything|clear everything|clear all|never mind all that)\b/i;

/**
 * A parent's own words for dropping ONE filter, and the keys each drops.
 *
 * The verb and the noun must sit together: a bare verb match would read "drop-in
 * classes" as a request to drop something, and a bare noun match would read "what's
 * your price range" the same way. One noun can clear several keys — forgetting the
 * budget has to clear the cheapest-first ask too, or the results are still ordered
 * by price after the ceiling is gone.
 */
const VERB = String.raw`(?:forget|drop|remove|undo|clear|ignore|scrap)`;
const ARTICLE = String.raw`(?:\s+(?:the|that|my|a|any))?`;
const retraction = (nouns: string) =>
  new RegExp(`\\b${VERB}${ARTICLE}\\s+(?:${nouns})\\b`, "i");

const RETRACTIONS: ReadonlyArray<readonly [RegExp, readonly CarriedFilterKey[]]> = [
  [retraction("budget|budgets|price|prices|pricing|cost|costs"), ["maxPrice", "cheap"]],
  [
    retraction("area|areas|location|locations|district|districts|region|regions|place"),
    ["district", "nearDistrict", "region"],
  ],
  [retraction("age|ages|age filter|age range"), ["age"]],
  [retraction("day|days|time|times|schedule|weekend|weekends"), ["daysOfWeek", "timeOfDay"]],
  [retraction("activity|activities|topic|search|query"), ["activity"]],
  [retraction("indoor|outdoor|venue type"), ["locationType"]],
];

/**
 * Which carried filters a message asks to drop. The concierge could add and overwrite
 * filters but never remove one, so "forget the budget" and "start over" were
 * instructions it had no mechanism to obey — and it said it had obeyed them anyway.
 * Returns an empty list for an ordinary message, so a normal turn is unaffected.
 */
export function parseRetractions(message: string): CarriedFilterKey[] {
  const text = message || "";
  if (RESET_PHRASES.test(text)) return [...CARRIED_FILTER_KEYS];

  const keys = new Set<CarriedFilterKey>();
  for (const [pattern, cleared] of RETRACTIONS) {
    if (pattern.test(text)) cleared.forEach((key) => keys.add(key));
  }
  return [...keys];
}

/**
 * The message with its retraction phrases removed, ready to be read for filters.
 *
 * Needed because the words that ASK for a clear also look like a filter: "forget the
 * budget" contains "budget", which reads as "show me the cheapest" — so parsing the
 * raw message would re-set the very filter the parent just dropped. Stripping first
 * leaves only what they actually want, which is why "forget the budget, make it under
 * $300" still lands on $300.
 */
export function stripRetractionPhrases(message: string): string {
  let text = message || "";
  if (RESET_PHRASES.test(text)) text = text.replace(RESET_PHRASES, " ");
  for (const [pattern] of RETRACTIONS) text = text.replace(pattern, " ");
  return text.replace(/\s{2,}/g, " ").trim();
}
