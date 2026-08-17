/**
 * Shared harness for the CONCIERGE eval suite (the parent-facing chat).
 *
 * Mechanism: drive scripted parent conversations through the REAL public
 * endpoints, then score DETERMINISTIC invariants read back from the HTTP
 * response's `results` (the SearchResponseDTO the chat returns), plus an advisory
 * LLM-as-judge on the prose. Unlike the merchant agent eval there is NO DB
 * tool-trace (concierge telemetry is PostHog-only) and NO confirm gate — the
 * concierge is public + read-only, so the search RESULTS are the deterministic
 * signal:
 *   - discovery (/concierge/chat): a query returns a results envelope.
 *   - merchant-location (/concierge/merchant-location/chat): EVERY returned product
 *     belongs to the pinned merchant/location, and the global provider directory
 *     is never returned (products-only). This is the production-critical invariant.
 *
 * Prereqs: booking_system on :4003 with OPENROUTER_API_KEY set server-side and
 * Typesense reachable + indexed; a merchant/location with PUBLISHED products for
 * the venue scenarios (CONCIERGE_EVAL_MERCHANT_ID / _LOCATION_ID, falling back to
 * the AI_EVAL_* sandbox). No DB access needed — scoring is off the HTTP response.
 *
 * Each scenario file under ./scenarios/*.mjs exports `{ category, scenarios: [...] }`;
 * a scenario is `{ name, mode?: "discovery"|"venue", merchantId?, locationId?,
 * include?, turns, check }`. all-scenarios.mjs collects them; run.mjs runs them here.
 */
try { process.loadEnvFile(); } catch { /* no .env — rely on real env / defaults */ }
import { AsyncLocalStorage } from "node:async_hooks";

const FALLBACK_MERCHANT = Number(
  process.env.CONCIERGE_EVAL_MERCHANT_ID || process.env.AI_EVAL_MERCHANT_ID || 977,
);
const FALLBACK_LOCATION = Number(
  process.env.CONCIERGE_EVAL_LOCATION_ID || process.env.AI_EVAL_LOCATION_ID || 1708,
);

/**
 * The venue(s) the merchant-location scenarios run against. Every venue scenario is
 * fanned out across ALL of these (the runner expands one entry per venue), so the
 * scope-confinement / knowledge / grounding invariants are proven for MULTIPLE
 * merchants, not just one. Configure via:
 *   CONCIERGE_EVAL_VENUES="977:1708,1001:2002,1042:2105"   (merchantId:locationId, comma-separated)
 * Falls back to the single CONCIERGE_EVAL_* / AI_EVAL_* sandbox pair when unset, so
 * the default single-venue run is unchanged. Each venue should have PUBLISHED,
 * indexed products for the positive paths to be meaningful.
 */
function parseVenues() {
  const list = (process.env.CONCIERGE_EVAL_VENUES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [m, l] = pair.split(":").map((n) => Number(n.trim()));
      return { merchantId: m, locationId: l };
    })
    .filter((v) => v.merchantId && v.locationId);
  return list.length
    ? list
    : [{ merchantId: FALLBACK_MERCHANT, locationId: FALLBACK_LOCATION }];
}

export const cfg = {
  base: process.env.BOOKING_API_BASE || "http://localhost:4003/api/v1",
  // The full set of venues the merchant-location suite covers.
  venues: parseVenues(),
  // The ACTIVE venue — the runner sets these per run when fanning a venue scenario
  // across `venues`, so the default-scope checks (`venueScopeIssues`, which defaults
  // to `cfg`) validate against the venue the run actually targeted. Defaults to the
  // first configured venue so single-venue runs behave exactly as before.
  merchantId: parseVenues()[0].merchantId,
  locationId: parseVenues()[0].locationId,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- transport (PUBLIC — no auth headers) ------------------------------------
const jsonHeaders = { "content-type": "application/json" };
const TURN_TIMEOUT_MS = 120_000;

async function post(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TURN_TIMEOUT_MS);
  try {
    const r = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} ${r.status}: ${j.message || j.code || ""}`);
    return j; // { conversationId, reply, results }
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`${path} timed out after ${TURN_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Global product-discovery chat (the /concierge page). `category`/`region` are
 *  the FE filter chips (one value or an array) — pinned server-side into the search. */
export function discoveryChat(
  message,
  { conversationId, include, category, region } = {},
) {
  return post("/concierge/chat", {
    message,
    ...(conversationId ? { conversationId } : {}),
    ...(include ? { include } : {}),
    ...(category != null ? { category } : {}),
    ...(region != null ? { region } : {}),
  });
}

/** Merchant-location chat (the per-card "concierge for THIS place"). Both
 *  merchantId AND locationId are REQUIRED by the endpoint — a store chat is always
 *  one merchant at one location. */
export function venueChat(message, { merchantId, locationId, conversationId } = {}) {
  return post("/concierge/merchant-location/chat", {
    message,
    merchantId,
    locationId,
    ...(conversationId ? { conversationId } : {}),
  });
}

// --- LLM-as-judge (advisory; skipped without OPENROUTER_API_KEY) -------------
// The judge model is configurable via JUDGE_MODEL (default keeps the historical
// gemini-2.5-flash). For a model A/B (compare-models.mjs) it MUST be a NEUTRAL arbiter — a
// model that is NOT one of the candidates under test — otherwise a candidate ends
// up judging its own prose (self-preference bias skews the verdict, and since the
// scenarios GATE on the judge it's not cosmetic).
export const JUDGE_MODEL_DEFAULT = "google/gemini-2.5-flash";

// Rolling per-run judge stats, so a model A/B can (a) SUBTRACT the judge's own
// spend from the credits-delta to isolate the candidate model's cost, and (b)
// surface how many judge calls were SKIPPED (rate-limit / timeout) — if skip rates
// differ across candidates, the judged scores aren't comparable and should be
// discounted in favour of the deterministic floor.
export const judgeStats = { costUsd: 0, calls: 0, skips: 0, fails: 0 };
export function resetJudgeStats() {
  judgeStats.costUsd = 0;
  judgeStats.calls = 0;
  judgeStats.skips = 0;
  judgeStats.fails = 0;
}
// Judge-attributed failure reasons for the CURRENT scenario, so the runner can
// tell a genuine (deterministic) failure apart from a judged-prose one — the
// deterministic floor is the unbiased signal. The scenario pushes the judge's
// `reason` into its issue list verbatim, so a reason recorded here is a substring
// of the issue string it produced. Held in AsyncLocalStorage (not a module global)
// so scenarios can run CONCURRENTLY without cross-contaminating each other's
// judge attribution.
const judgeReasonStore = new AsyncLocalStorage();
export function runScenarioJudged(fn) {
  return judgeReasonStore.run([], fn);
}
export function scenarioJudgeReasons() {
  return judgeReasonStore.getStore() ?? [];
}

export async function judge(text, rubric) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    judgeStats.skips++;
    return { pass: true, reason: "(no OPENROUTER_API_KEY — judge skipped)", skipped: true };
  }
  const model = process.env.JUDGE_MODEL || JUDGE_MODEL_DEFAULT;
  try {
    const r = await fetch(`${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        // Ask OpenRouter to echo authoritative usage (incl. charged `cost`) so the
        // A/B runner can isolate the judge's spend from the candidate model's.
        usage: { include: true },
        messages: [
          { role: "system", content: 'You are a strict evaluator. Decide if TEXT satisfies the RUBRIC. Reply ONLY with compact JSON: {"pass": true|false, "reason": "<=12 words"}.' },
          { role: "user", content: `RUBRIC: ${rubric}\n\nTEXT:\n${text}` },
        ],
      }),
    });
    const j = await r.json().catch(() => ({}));
    // Capture spend BEFORE parsing content, so a charged-but-malformed reply still
    // counts against the judge's cost (it was billed regardless).
    if (typeof j?.usage?.cost === "number") judgeStats.costUsd += j.usage.cost;
    const content = (j?.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
    const v = JSON.parse(content);
    judgeStats.calls++;
    if (!v.pass) {
      judgeStats.fails++;
      const store = judgeReasonStore.getStore();
      if (v.reason && store) store.push(v.reason);
    }
    return { pass: !!v.pass, reason: v.reason || "" };
  } catch (e) {
    // Advisory judge: a transient infra hiccup (rate-limit / timeout / malformed JSON)
    // must NOT fail an otherwise-good scenario — skip (pass) like the no-key path, and
    // surface it as a note. Only the deterministic checks should ever gate.
    judgeStats.skips++;
    return { pass: true, skipped: true, reason: `judge error (skipped): ${String(e.message).slice(0, 60)}` };
  }
}

// --- deterministic check helpers (off the HTTP `results`) --------------------
const products = (results) => results?.products?.data ?? [];
const merchants = (results) => results?.merchants?.data ?? [];

/** How many results came back (products + providers). */
export const resultCount = (results) =>
  (results?.products?.total ?? 0) + (results?.merchants?.total ?? 0);

/**
 * VENUE INVARIANT: the results stay confined to the pinned merchant + location.
 * Returns a list of violations (empty = good). This is the production-critical
 * check — the server pins the scope; the model can't widen.
 *
 * The merchant-location response is the lean "store" shape: per-product nested
 * merchant/location are stripped, but the store identity is lifted to
 * `results.store` and each product keeps its scalar `locationId`. So we verify (a)
 * the store header matches the pinned merchant/location and (b) every product's
 * scalar `locationId` matches the pinned location (a location belongs to exactly
 * one merchant, so a location match also confines the merchant).
 */
export function productsOutOfScope(results, { merchantId, locationId }) {
  const bad = [];
  const store = results?.store;
  if (merchantId && store?.merchant?.id && store.merchant.id !== merchantId)
    bad.push(`store merchant ${store.merchant.id} ≠ ${merchantId}`);
  if (locationId && store?.location?.id && store.location.id !== locationId)
    bad.push(`store location ${store.location.id} ≠ ${locationId}`);
  for (const p of products(results)) {
    if (locationId && p.locationId && p.locationId !== locationId)
      bad.push(`product "${p.name}" → location ${p.locationId} ≠ ${locationId}`);
  }
  return bad;
}

/** Number of providers in the response — a venue chat must return 0 (products-only). */
export const providerCount = (results) => merchants(results).length;

// Region chip label → SG_REGIONS enum value (mirrors the server's
// normalizeSearchRegions: uppercase, spaces/hyphens → underscore).
const toRegionEnum = (chip) =>
  String(chip).trim().toUpperCase().replace(/[\s-]+/g, "_");

/**
 * REGION FILTER INVARIANT (discovery): every product's region is one of the
 * selected region chips. "Anywhere" (or no region) imposes NO constraint. Returns
 * violations (empty = good). Deterministic — the discovery product DTO carries
 * `location.sgRegion`.
 */
export function productsOutOfRegions(results, regionChips) {
  // A deliberately BROADENED set (the parent's exact filters matched nothing, so the
  // concierge relaxed them to avoid an empty grid) is not a confinement violation.
  if (results?.broadened) return [];
  const chips = (Array.isArray(regionChips) ? regionChips : [regionChips]).filter(
    Boolean,
  );
  const wanted = chips.map(toRegionEnum).filter((r) => r && r !== "ANYWHERE");
  if (!wanted.length) return []; // Anywhere / none → no region constraint
  const bad = [];
  for (const p of products(results)) {
    const region = p?.location?.sgRegion;
    if (region && !wanted.includes(region))
      bad.push(`product "${p.name}" region ${region} ∉ [${wanted.join(",")}]`);
  }
  return bad;
}

/**
 * AGE-FIT INVARIANT (discovery): when the parent stated an age, every returned
 * product's [ageMin, ageMax] band must INCLUDE it — the search grounds `age` into
 * a hard range filter, so a class for 8–12 year olds coming back for a 5 year old
 * is a real mismatch this catches. Deterministic — the discovery product DTO
 * always carries `ageMin`/`ageMax`. Empty results → no violations (a no-match is a
 * separate concern). Returns violations (empty = good).
 */
export function productsOutOfAge(results, age) {
  if (age == null) return [];
  if (results?.broadened) return []; // broadened fallback — age was intentionally relaxed
  // The parent speaks in YEARS; the catalogue stores the band in MONTHS. Comparing the
  // two directly both invents violations (a 4-year-old "excluded" from a 36–204 month
  // band that plainly contains them) and hides real ones (a 12–24 month class passes
  // for a 5 year old, since 5 is neither below 12 nor above 24).
  const ageMonths = age * 12;
  const bad = [];
  for (const p of products(results)) {
    if (
      typeof p.ageMin === "number" &&
      typeof p.ageMax === "number" &&
      (ageMonths < p.ageMin || ageMonths > p.ageMax)
    )
      bad.push(
        `product "${p.name}" ages ${p.ageMin}-${p.ageMax} months excludes ${age}y (${ageMonths}m)`,
      );
  }
  return bad;
}

/**
 * PRODUCT-TYPE INVARIANT (discovery): every returned product's `productType` is
 * one of the allowed set — e.g. a 'Camps' chip ⇒ only CAMP, a 'birthday party'
 * intent ⇒ only BIRTHDAY. Deterministic (the DTO carries `productType`). Pass the
 * allowed type(s) as a string or array. Returns violations (empty = good).
 */
export function productsOfWrongType(results, allowed) {
  const ok = Array.isArray(allowed) ? allowed : [allowed];
  const bad = [];
  for (const p of products(results)) {
    if (p.productType && !ok.includes(p.productType))
      bad.push(`product "${p.name}" is ${p.productType}, expected ${ok.join("/")}`);
  }
  return bad;
}

/**
 * DISTRICT INVARIANT (discovery): when an EXACT area is selected ("in/at X"),
 * every product's `location.sgDistrict` matches one of the wanted districts
 * (case-insensitive). Use ONLY for "in/at" intents — "near/around" is a proximity
 * RANKING, not a hard filter, so don't assert it deterministically. Returns
 * violations (empty = good).
 */
export function productsOutOfDistricts(results, districtNames) {
  if (results?.broadened) return []; // broadened fallback — area was intentionally relaxed
  const wanted = (Array.isArray(districtNames) ? districtNames : [districtNames])
    .filter(Boolean)
    .map((d) => String(d).trim().toLowerCase());
  if (!wanted.length) return [];
  const bad = [];
  for (const p of products(results)) {
    const d = p?.location?.sgDistrict;
    if (d && !wanted.includes(String(d).toLowerCase()))
      bad.push(`product "${p.name}" district ${d} ∉ [${wanted.join(",")}]`);
  }
  return bad;
}

/** True when the search returned at least one product or provider. */
export const hasResults = (results) => resultCount(results) > 0;

/** A search actually RAN this turn (a results envelope came back, not null). */
export const searched = (results) => results != null;

/** Concierge prompt-leak signatures (mirror src/ai/assistants/concierge: the prompt
 *  section headers + the search tool name never appear in a genuine parent reply). */
const LEAK_PATTERNS = [
  /HOW YOU WORK/i,
  /HOW YOU REPLY/i,
  /\bsearch_activities\b/,
  /<<\s*UNTRUSTED_TOOL_DATA/i,
  /\b(?:ATH|BR|NF|GE)_\d{3}\b/,
];
export function replyLeaks(text) {
  const s = String(text || "");
  return LEAK_PATTERNS.filter((p) => p.test(s)).map((p) => p.source);
}

/**
 * REPLY-FORMAT INVARIANT (both surfaces): the CONCIERGE_REPLY rules forbid emojis /
 * decorative symbols, markdown tables, and raw JSON / data dumps (the app renders
 * the result cards itself; the prose must stay plain). These are things the MODEL
 * controls and the app never injects, so they're a clean deterministic signal of
 * format/persona adherence. Returns violations (empty = good).
 */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const MD_TABLE_RE = /\n\s*\|.*\|.*\|/; // a markdown table row (>=2 pipes on a line)
const JSON_DUMP_RE = /\{\s*"[A-Za-z_]+"\s*:/; // a raw JSON object literal in the prose
export function replyFormatIssues(text) {
  const s = String(text || "");
  const issues = [];
  if (EMOJI_RE.test(s)) issues.push("contains an emoji / decorative symbol");
  if (MD_TABLE_RE.test(s)) issues.push("contains a markdown table");
  if (JSON_DUMP_RE.test(s)) issues.push("contains raw JSON");
  return issues;
}

// --- composite check helpers (DRY: shared by whole groups of scenarios) -------
// The two recurring deterministic "floors" every scenario starts from, factored
// out so individual scenario files stay declarative (data + rubric) instead of
// re-implementing the same invariant block. Each returns an issue-string array.

/**
 * DISCOVERY floor: a search ran this turn and the prose leaked nothing. Use for
 * any global-discovery scenario whose minimum bar is "it actually searched".
 */
export function discoveryRan(results, text) {
  const issues = searched(results) ? [] : ["no search ran this turn"];
  const leaks = replyLeaks(text);
  if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
  return issues;
}

/**
 * VENUE floor (the production-critical invariant): results stay confined to the
 * pinned merchant/location, the global provider directory never leaks (products-
 * only), and the prose leaks no prompt/tool internals. Scope defaults to the
 * configured eval venue (`cfg`). Use for every merchant-location scenario.
 */
export function venueScopeIssues(results, text, scope = cfg) {
  const issues = [
    ...productsOutOfScope(results, {
      merchantId: scope.merchantId,
      locationId: scope.locationId,
    }),
  ];
  if (providerCount(results) > 0)
    issues.push("venue chat returned global providers (must be products-only)");
  const leaks = replyLeaks(text);
  if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
  return issues;
}

// --- runner ------------------------------------------------------------------
async function drive(sc) {
  let conversationId;
  const replies = [];
  let lastResults = null;
  for (const turn of sc.turns) {
    const r =
      sc.mode === "venue"
        ? await venueChat(turn, { merchantId: sc.merchantId ?? cfg.merchantId, locationId: sc.locationId ?? cfg.locationId, conversationId })
        : await discoveryChat(turn, {
            conversationId,
            include: sc.include,
            category: sc.category,
            region: sc.region,
          });
    conversationId = r.conversationId;
    replies.push(r.reply || "");
    if (r.results) lastResults = r.results;
  }
  await sleep(300);
  return { conversationId, replies, results: lastResults, allReplies: replies.join("\n"), lastReply: replies[replies.length - 1] || "" };
}

function color(s, c) { return `\x1b[${c}m${s}\x1b[0m`; }

/**
 * Fan every VENUE scenario out across all configured venues (`cfg.venues`) so the
 * merchant-location invariants are proven for MULTIPLE merchants — unless a scenario
 * pins its own merchantId/locationId. Discovery scenarios pass through unchanged.
 * Each expanded run carries `_venue` (the runner sets it active before the run, so
 * the default-scope checks validate against the right venue) and, when there's more
 * than one venue, a venue tag in the name to keep the output readable.
 */
function expandVenues(list) {
  const multi = cfg.venues.length > 1;
  return list.flatMap((s) => {
    if (s.mode !== "venue" || s.merchantId || s.locationId) return [s];
    return cfg.venues.map((v) => ({
      ...s,
      merchantId: v.merchantId,
      locationId: v.locationId,
      _venue: v,
      name: multi ? `${s.name} [m${v.merchantId}/l${v.locationId}]` : s.name,
    }));
  });
}

export async function runEval(scenarios, filter) {
  // Filter matches by category SUBSTRING or name substring. Because every category
  // is "<folder>-<file>", this gives three useful granularities from one arg:
  //   -- venue        → every "venue-*" category (a whole surface)
  //   -- shared       → every "shared-*" category (all cross-cutting)
  //   -- camps        → discovery-camps AND venue-camps (a theme across surfaces)
  //   -- venue-pricing→ exactly that file;  -- "free trial" → a name substring
  // NOTE: `s.group` is the scenario TAXONOMY ("discovery-products"); `s.category`
  // is the API filter chip the scenario sends. Filter/group/display use `group`.
  const f = filter?.toLowerCase();
  const list = filter
    ? scenarios.filter(
        (s) =>
          s.group.toLowerCase().includes(f) ||
          s.name.toLowerCase().includes(f),
      )
    : scenarios;

  if (list.length === 0) {
    console.log(`No scenarios match "${filter}". Categories: ${[...new Set(scenarios.map((s) => s.group))].join(", ")}`);
    return { passed: 0, total: 0, failed: [] };
  }

  // Fan venue scenarios across every configured venue (multi-merchant coverage).
  const runs = expandVenues(list);
  const venueLabel = cfg.venues.map((v) => `${v.merchantId}/${v.locationId}`).join(", ");
  const judgeModel = process.env.OPENROUTER_API_KEY
    ? process.env.JUDGE_MODEL || JUDGE_MODEL_DEFAULT
    : "(disabled)";
  resetJudgeStats();
  // The concierge is public + read-only and each conversation is independent, so
  // scenarios can run CONCURRENTLY (bounded) — the dominant cost is sequential live
  // model latency, not compute. Concurrency is enabled only for a SINGLE pinned venue:
  // with multiple venues the runner pins the active venue on the shared `cfg` per run,
  // which would race under parallelism, so multi-venue falls back to serial. Tune with
  // CONCIERGE_EVAL_CONCURRENCY (default 6).
  const singleVenue = cfg.venues.length <= 1;
  const CONC = singleVenue
    ? Math.max(1, Number(process.env.CONCIERGE_EVAL_CONCURRENCY || 6))
    : 1;
  if (singleVenue && cfg.venues[0]) {
    cfg.merchantId = cfg.venues[0].merchantId;
    cfg.locationId = cfg.venues[0].locationId;
  }
  console.log(`\nConcierge eval → ${cfg.base}  (venues: ${venueLabel})  — ${runs.length} run(s), concurrency ${CONC}  [judge: ${judgeModel}]\n`);

  let passed = 0; // full pass (deterministic AND judge)
  let detPassed = 0; // deterministic-only pass (ignores judged-prose failures)
  let latencyMs = 0; // summed per-scenario turn wall time (inflated under concurrency)
  const failed = [];
  const byCategory = {};
  let criticalTotal = 0; // must-pass invariants (no fabrication / no leak / safety)
  const criticalFailed = [];

  // Score one scenario end-to-end and fold its result into the accumulators. Each runs
  // in its own AsyncLocalStorage judge-reason scope, so the deterministic-vs-judged
  // split stays correct under parallelism. Accumulator mutations are synchronous
  // (single-threaded JS), so no locking is needed.
  async function runOne(sc) {
    // Multi-venue only (CONC===1, serial): pin the active venue on the shared cfg.
    if (!singleVenue) {
      const v =
        sc._venue ||
        (sc.mode === "venue" && sc.merchantId
          ? { merchantId: sc.merchantId, locationId: sc.locationId }
          : null);
      if (v) { cfg.merchantId = v.merchantId; cfg.locationId = v.locationId; }
    }
    await runScenarioJudged(async () => {
      let issues;
      let run = null;
      const t0 = Date.now();
      try {
        run = await drive(sc); // the concierge turns — timed for the latency column
        latencyMs += Date.now() - t0;
        issues = (await sc.check({ ...run })) || []; // may call the judge (untimed)
      } catch (e) {
        if (run === null) latencyMs += Date.now() - t0;
        issues = [`harness error: ${e.message}`];
      }

      // Split the verdict: the DETERMINISTIC floor (unbiased, code-checked invariants)
      // vs the full pass (also gated on the judged prose). A judged-prose failure is an
      // issue string that CONTAINS a reason the judge recorded this scenario.
      const reasons = scenarioJudgeReasons();
      const detIssues = issues.filter((i) => !reasons.some((r) => r && i.includes(r)));
      const pass = issues.length === 0;
      const detPass = detIssues.length === 0;

      // One atomic multi-line write so concurrent scenarios don't interleave output.
      const mark = pass ? color("✓", 32) : detPass ? color("◐", 33) : color("✗", 31);
      let line = `  ${mark} ${color(sc.group, 36)} · ${sc.name}`;
      for (const i of issues) line += `\n      ${color("- " + i, 31)}`;
      console.log(line);

      const cat = (byCategory[sc.group] ??= { passed: 0, detPassed: 0, total: 0 });
      cat.total++;
      if (pass) { passed++; cat.passed++; } else failed.push(sc.name);
      if (detPass) { detPassed++; cat.detPassed++; }
      if (sc.critical) { criticalTotal++; if (!pass) criticalFailed.push(`${sc.group} · ${sc.name}`); }
    });
  }

  // Bounded worker pool: CONC workers pull from a shared cursor until the list drains.
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= runs.length) return;
      await runOne(runs[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, runs.length) }, worker));

  console.log("\n" + "─".repeat(64));
  console.log(color(` ${"Category".padEnd(24)}${"Det".padEnd(9)}${"Full".padEnd(9)}Rate`, 1));
  console.log("─".repeat(64));
  for (const cat of Object.keys(byCategory).sort()) {
    const { passed: cp, detPassed: dp, total: ct } = byCategory[cat];
    const rate = ct ? Math.round((cp / ct) * 100) : 0;
    const bar = cp === ct ? color("✓", 32) : dp === ct ? color("◐", 33) : color("✗", 31);
    console.log(`${bar}${color(` ${cat.padEnd(24)}${`${dp}/${ct}`.padEnd(9)}${`${cp}/${ct}`.padEnd(9)}${rate}%`, cp === ct ? 90 : 31)}`);
  }
  console.log("─".repeat(64));
  const totalRate = runs.length ? Math.round((passed / runs.length) * 100) : 0;
  const detRate = runs.length ? Math.round((detPassed / runs.length) * 100) : 0;
  console.log(`Deterministic: ${detPassed}/${runs.length} (${detRate}%)   Full: ${passed}/${runs.length} (${totalRate}%)`);
  console.log(`Judge (${judgeModel}): ${judgeStats.calls} scored, ${judgeStats.fails} failed, ${judgeStats.skips} skipped, $${judgeStats.costUsd.toFixed(4)}`);
  // CRITICAL gate: must-pass invariants (no fabrication / no cross-scope leak / safety).
  // A single critical failure blocks a ship, however high the overall rate.
  if (criticalTotal) {
    const cp = criticalTotal - criticalFailed.length;
    if (criticalFailed.length === 0) {
      console.log(color(`CRITICAL: ${cp}/${criticalTotal} ✓  (all must-pass invariants held)`, 32));
    } else {
      console.log(color(`⛔ CRITICAL: ${cp}/${criticalTotal} — ${criticalFailed.length} must-pass FAILED (blocks ship):`, 31));
      for (const n of criticalFailed) console.log(color(`     - ${n}`, 31));
    }
  }
  if (failed.length) console.log(color(`Failed:   ${failed.join("; ")}`, 31));
  console.log("─".repeat(64) + "\n");
  return {
    passed,
    detPassed,
    total: runs.length,
    failed,
    criticalTotal,
    criticalFailed,
    byCategory,
    latencyMs,
    judge: { ...judgeStats },
  };
}
