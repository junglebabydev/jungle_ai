# Execution plan: Jungle Concierge and Merchant Setup Agent

**Date:** 2026-08-11
**Sources:** PRD 1 v1.1, PRD 2 v1.1, and [prd-gap-analysis.md](./prd-gap-analysis.md) Part III
**Repos:** `jungle_ai`, `search_engine`, `booking_system`

No dates. Each phase states what must be true before it starts and what proves it is done.

> **Status, 2026-08-11.** Phases 1 and 2 are implemented and verified; Phase 3 landed
> alongside Phase 2 except its data-dependent gate. See
> [Implemented so far](#implemented-so-far) before reading the plan below.

---

## Implemented so far

Both repos: typecheck 0 errors, builds clean, **212 tests / 19 suites passing** (from
128 passing and 12 broken at the start). Nothing committed — all changes sit in the
working tree.

### Every falsehood a parent could be told, and what closed it

| Defect | How often it fired | Closed by |
|---|---|---|
| Venue rating presented as the activity's | **every card of every search** | `rating` → `venueRating`, attribution required |
| Relaxed results presented as matches | every zero-result query | ladder flags rungs 2 and 3, not just 4 |
| The parent's budget dropped at rung 3 | any budgeted query reaching it | `relaxed[]` names what went |
| Prices invented | any price question | `priceFrom` + `priceType` projected |
| Budget inert on four of five product types | any budget on a non-camp | `(priceFrom:<=X \|\| hasPrice:=false)` |
| "I removed that filter" when nothing changed | "forget the budget", "start over" | `parseRetractions` + retract-before-merge |
| Superlatives from a sample of eight | any "best" / "highest rated" | `ratingScore` + two-key sort |
| An excluded area returned as the search | "not in Holland Village" | `excludeDistrict` |
| "Switch to the CAMPS tab" for camps already on screen | ACTIVITIES and PACKAGES tabs | tab clause matched to the code |
| Free indistinguishable from not listed | any free activity | `isFree`, and the `n > 0` filter removed |
| A per-child party price given as the total | any birthday with a group minimum | `hasMinimumSpend` from `minKids` |
| A restricted rate quoted as the standard one | any qualified pricing row | `priceQualified` |

### Also delivered

- **Safeguarding rules extracted** to a standalone, framework-free `ABOUT THE CHILD`
  block — and now on BOTH surfaces; the venue chat previously had none.
- **Explorer Map Tier 1 removed.** Discovery prompt 10,215 → 8,569 chars. Trail
  filtering still works: the server infers it from the parent's own words.
- **Pre-booking detail projected** into the venue block — what's included, duration,
  group size, cancellation — from data that already existed and was never read.
- **Result ordinals** (`ref`), so "the second one" has a referent.
- **Search response cached** (60s, single-flight, keyed on the grounded input).
- **The complement search parked** — its only consumer went with Fix 0, so it was
  spending a round-trip on a result nobody read.
- **Prompt versions reach telemetry** for both brains. `CONCIERGE_PROMPT_VERSION`
  existed but was consumed nowhere, so attribution was broken on both, not one.
- **12 dead loop tests revived** — their mock lacked `LocationService.internal`, so
  they threw before asserting anything.

### What is left

| Item | Why it is not done |
|---|---|
| **The reindex** | Operational. `ratingScore`, `hasPrice` and the price fields do not exist on current documents — until it runs, unpriced products drop out of budget searches |
| **50-product price verification** | `search_engine` has no `.env`, so the live-search step never ran. `priceFrom` is verified to compile and be plumbed, never against real data |
| **Fix 9a** (`rawQuery`) | Not implementable as written: `vector_query` embeds `q` and takes no separate text, so it needs keyword/vector fusion. Moved to Phase 6 beside its consumers |
| **E5** (persist accumulated state) | Needs a column on `ConciergeConversation`; this service never migrates |
| **Fix 10** (govern proximity) | Blocked on decision 11. **The one remaining live falsehood surface** — geo filtering and distance sort run in production with no rule about what may be claimed |
| **Fix 13** (ambiguous area) | Blocked on decision 12 |
| **Fix 14** (AI Overview) | Neither agent produces it |

### Deploy order

`search_engine` → **reindex** → `jungle_ai`. The reindex is not optional.

---

## Three tracks, running in parallel

| Track | Phases | Repos | Depends on |
|---|---|---|---|
| **A. Concierge honesty** | 1 → 2 → 3 | `jungle_ai`, then `search_engine` | Phase 0 decisions |
| **B. Merchant agent** | 4 | `jungle_ai` | nothing after Phase 0 |
| **C. Capture → retrieval** | 5 → 6 | `booking_system`, `jungle_ai`, `search_engine` | nothing after Phase 0 |

Track C has the longest lead time and gates the last phase of Track A. **Start it in parallel with Phase 1, not after Phase 3.** If it starts late, retrieval and the merchant page never improve regardless of what else ships.

---

## Phase 0 — Unblock. No production code.

Everything here is a decision, a fixture, or housekeeping. Nothing in Phases 1 to 6 should start until the decisions it depends on are written down.

### 0.1 Decisions to answer

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 9 | Plan-request replacement wording | Use PRD 1 Fix 0f's draft as an interim | all of Fix 0 |
| 11 | Proximity: surface with a disclosure rule, or disable the `near` path | **Surface** — it already works and 97% of locations have coordinates | Fix 10 |
| 12 | Ambiguous area: build grouped results, or move the §9.1 row 7 test | **Move the test** to a later cycle; it is not a falsehood, only a missed refinement | Fix 13 |
| 13 | Qualified prices: unrestricted rows only, or expose `priceQualified` | **Expose the flag** — dropping restricted rows hides real inventory | Fix 6 stage 2 |
| 10 / M6 | Which schema is authoritative | Confirm `mcp/booking_system` (2,291 lines). **Five minutes, not a workstream** — see gap analysis §12.2 C2 | nothing, once confirmed |
| 4 / M1 | Birthday minimum spend | Confirm `PARTY_BASE × minKids` as the proxy | M-Fix 4, Fix 6c |
| 8 | Eval fixture merchant and location ids | — | Fix 7a |
| M4 | Which tools are in scope for conditional prompt composition | — | M-Fix 7, M-Fix 2 |

Decision 11 is the one to answer first: proximity is a live capability with no prompt rule governing what the agent may claim about it.

### 0.2 Work with no dependencies

1. **M-Fix 0** — fix `NEVER YOUR  NTERNAL PROCESS` at `merchantSystemPrompt.ts:75`; add `MERCHANT_PROMPT_VERSION` and attach it to telemetry. Blocks attribution of every later merchant change.
2. **Fix 7a** — repoint `CONCIERGE_EVAL_MERCHANT_ID` / `CONCIERGE_EVAL_LOCATION_ID` at the indexed dev catalogue, re-run `npm run eval:concierge:ab`. Owned by one person, alone. Every later reply-quality claim depends on it.
3. **Schema hygiene** — retire the stale archives under `~/Downloads/booking_system-main *`, add `npm run check:schema` to CI. This is all that survives of Fix 12.
4. **Timed reindex on dev** — measure it now so Phase 2 is not planned on a guess.

**Exit criteria:** eight decisions written down; the eval fixture produces a trustworthy judged score; CI fails on schema drift.

---

## Phase 1 — Concierge falsehood removal. `jungle_ai` only.

No service change, no reindex, no coordinated deploy. This phase removes every falsehood that can be removed without `search_engine`.

**Order within the phase is not optional.** Steps 1.1 to 1.3 all edit the prompt files and are serialised behind one owner; the rest can go in parallel afterwards.

### The serialised prompt chain

| # | Change | Why here |
|---|---|---|
| **1.1** | Extract the safeguarding rules to a standalone `ABOUT THE CHILD` block, with a prompt unit test asserting their presence | **Must precede any deletion.** Two of the eight Explorer Map bullets are child-safety rules; deleting the block first is the severe-regression path |
| **1.2** | Fix 0 Tier 1 — remove Explorer Map parent-facing language | Shrinks the file every later fix edits. Keep `trails.ts`, the server inference and the `trail` field — filtering keeps working |
| **1.3** | Fix 1 honesty guards, **all three**: 1a price, 1b superlatives, 1c exclusions | The safety net for the whole cycle. 1b and 1c matter because Fix 4 and Fix 5 are two phases away |

### Then, in any order

| # | Change | Effect |
|---|---|---|
| **1.4** | Fix 4a-0 — rename `rating` → `venueRating`, `reviews` → `venueReviews`, add the attribution rule | Removes a falsehood that fires on **every card of every search**. One line plus one prompt rule |
| **1.5** | Fix 2 + gap analysis C1 — set `broadened` on ladder rungs **2 and 3**, not only rung 4, and populate `relaxed[]` | Fixes the model **and** the grid, and closes the silent `maxPrice` drop at rung 3 |
| **1.6** | Fix 6 stage 1 — project `priceFrom`, drop the camps-only budget clause. **Replace Fix 1a's wording in the same commit** | Turns "I cannot see prices" into a real answer. Already indexed, no reindex |
| **1.7** | Fix 3 — removable state, five format keys retained, plus gap analysis E5 (persist accumulated state) | The only failure a parent experiences as visibly broken. Pure unit tests |
| **1.8** | Fix 11 — project `BirthdayDetails` / `DropInDetails` into the venue ABOUT block | Real pre-booking answers already in the database, never shown |
| **1.9** | Gap analysis C3 — per-turn `ref` ordinal in `compactResults` | Gives "the second one" a referent without exposing ids |
| **1.10** | Gap analysis E3 — cache `search_activities` with the existing `LruTtlCache` | Largest efficiency win, zero behaviour change |
| **1.11** | Fix 10 — govern proximity per decision 11 | A live capability currently shipping with no rule |
| **1.12** | Fix 13 — only if decision 12 says build | Otherwise the test moves and this is skipped |

### Verification for the phase

Per `.claude/rules/10-verification.md`: `npm run typecheck` → `npm run build` → boot smoke → a live concierge turn against dev. Plus the §9.1 falsehood hunt, rows 1 to 7 and 9 to 10.

**Exit criteria:** three of five SEV1 falsehoods gone (B13, B3, B1 partially). Rows 1, 2, 3, 5, 6 of the falsehood hunt pass. Prompt down ~1,000 tokens per turn.

---

## Phase 2 — `search_engine` contract and reindex

Starts once the contract is frozen (needs decisions 1, 2, 3, 5, 13). Runs in parallel with the back half of Phase 1.

| # | Change |
|---|---|
| **2.1** | Accept `sort` (`relevance` / `rating` / `priceAsc`), rejecting unknown values rather than defaulting. `priceAsc` returns 400 until 3.3 lands |
| **2.2** | Accept `excludeDistrict` and `excludeMerchantIds`, grounding `excludeDistrict` against the district vocabulary |
| **2.3** | Index `ratingScore` — shrinkage-weighted, `m = 20`, `C` = catalogue mean. **Genuinely new: no rating field is indexed today** |
| **2.4** | Index `priceType`, `priceTo`, `priceIsRange`, `priceQualified`, `hasMinimumSpend` (from `PARTY_BASE × minKids`) |
| **2.5** | Make free representable — replace the `n > 0` filter at `products.ts:227` with a sentinel distinct from absent |
| **2.6** | Fix 9a — accept `rawQuery` alongside the stripped `query`. **Not gated on capture**, and it is a live defect today |
| **2.7** | Full reindex |

**Deploy rule:** `search_engine` deploys before `jungle_ai`, always. Both sides tolerate unknown/missing fields, so the order is policy, not a hard requirement.

**Exit criteria:** reindex completes within the Phase 0 timing; every new field is queryable; nothing reads the price fields yet.

---

## Phase 3 — Concierge consumes the new contract

| # | Change | Replaces |
|---|---|---|
| **3.1** | Fix 4 — add `sort` to `SearchToolInput` and `StructuredSearchInput`; two-key sort `_text_match(buckets:10):desc, ratingScore:desc` | the 1b guard |
| **3.2** | Fix 5 — expose `excludeDistrict` to the model only; add it to the carried keys and the Fix 3 retraction map | the 1c guard |
| **3.3** | **Verification gate — hard stop.** Verify `priceFrom` against the database on 50 products spanning all five types, **stratified across priced and unpriced** | — |
| **3.4** | Fix 6 stage 2 — surface `priceType`, `priceQualified`, `hasMinimumSpend`; relax the stage-1 "from $X only" rule | the stage-1 price limits |

**3.3 is a stop, not a checkpoint.** Any mismatch means stop, fix the indexer, keep the stage-1 rules. A wrong price is worse than no price.

**Exit criteria:** all ten rows of the §9.1 falsehood hunt pass. No reply attributes a rating to an activity or a price to a product it was not given.

---

## Phase 4 — Merchant agent. Parallel from Phase 1.

| # | Change | Gate |
|---|---|---|
| **4.1** | M-Fix 7 — regenerate the eval against the current taxonomy; keep the four memory scenarios structurally identical, then freeze them | decision M4 |
| **4.2** | **Model chain decision, added here.** The deployed lead `deepseek-v4-pro` runs 446s vs 131s for either Gemini, scoring one point below `gemini-2.5-flash` overall. Decide on the regenerated eval | 4.1 |
| **4.3** | M-Fix 1 — feed the confirmed-write outcome back as structured data. **Ships alone**, no other change in the commit | 4.1 merged, scenarios frozen |
| **4.4** | Extend `MerchantContext` to carry the product types in play | 4.3 reported |
| **4.5** | M-Fix 2 — conditional composition of the ~13% that is genuinely type-specific: `upsert_product` details, camp options, pricing, schedule, product types. **There is no separable package block** — the 35.5% figure counted core rules that merely mention packages. Then move invariants into code | 4.4, **and a baseline** |

**On 4.3's expected value:** `deepseek-v4-pro` is the only model that clears all four memory scenarios, and it is the deployed lead. In production this is a *fallback* problem. Still worth running — it settles the prompt-volume question — but do not let it outrank Phase 1.

**Exit criteria:** eval is trustworthy; the memory hypothesis is settled either way; rendered prompt for a class-only merchant contains no package or camp mechanics.

---

## Phase 5 — Data capture. Start in parallel with Phase 1.

The longest lead time in either document, and the ceiling on Phase 6.

| # | Change | Unblocks |
|---|---|---|
| **5.1** | M-Fix 3 — per-product completeness score, surfaced as agent behaviour rather than a dashboard | makes 5.2 to 5.4 measurable |
| **5.2** | M-Fix 4 — `priceType` validated in `preParkValidate`; `minKids` captured on every birthday; an unrestricted `Pricing` row alongside any restricted one | Phase 3.4 fully correct |
| **5.3** | M-Fix 5 — push for descriptions over 200 chars and non-empty tags, offering to draft rather than erroring | Phase 6 entirely |
| **5.4** | M-Fix 6 — `bookingRequired`, `packageRequired`, a location FAQ model, `cancellationPolicy` for classes and camps | B14's location half, two declined query classes |

Note what 5.4 no longer needs: `whatsIncluded` and `cancellationPolicy` already exist on `BirthdayDetails`, and `cancellationPolicy` on `DropInDetails`. Phase 1.8 projects them without any schema work.

**Exit criteria:** one completeness number reported per merchant. That number is the gate on Phase 6.

---

## Phase 6 — Retrieval quality. Gated on Phase 5.

| # | Change | Gate |
|---|---|---|
| ~~**6.1**~~ | ~~Fix 9c — tune `TYPESENSE_VECTOR_DISTANCE_THRESHOLD` (0.5)~~ **DONE — set to 0.65.** Fusion weights not touched | — |
| **6.2** | Fix 9d — query expansion on intent words, scored against `rawQuery` from 2.6 | 2.6 |
| **6.3** | Fix 9b — enrich indexed text with derived signals | 5.3 shows usable coverage |
| **6.4** | Fix 9e — cross-encoder rerank, retrieve 50 / return 20, hosted | 6.1–6.3 done, 5.3 baseline usable |

Measure recall@20 and precision@5 on 30 real parent phrasings **before and after each step independently**. Without per-step measurement you cannot tell which change helped.

### The harness and the baseline

`search_engine`'s `npm run benchmark:retrieval` scores 30 real parent phrasings against a
programmatic relevance oracle over the live catalogue. No model calls, so it is fast, free and
repeatable. Point it at a running server.

Report **`fill@20`**, not raw recall@20. With 20 slots and 1,548 relevant products, recall@20
cannot exceed 0.013 however good the ranking is — the raw figure tracks how broad the oracle was,
not how well search did. `fill@20` asks the answerable question: of the slots that COULD have held
a relevant result, how many did.

| Step | precision@5 | fill@20 | Note |
|---|---|---|---|
| Baseline (threshold 0.5) | 0.9586 | 0.9282 | 29/30 scored |
| **6.1 — threshold 0.65** | 0.9517 | **0.9506** | one top-5 result traded for far better fill |

The 6.1 gain is concentrated, not broad: only 3 of 29 queries moved. "toddler playgroup" went from
7 results to 18 against 158 relevant products, and camps filled completely; the cost was one
top-5 slot on "basketball". 0.80 scored 0.9541 — not worth the further precision risk.

**Two traps this harness has already fallen into — check for both before trusting a run:**
1. The catalogue stores ages in **months**; a parent speaks in years. An oracle comparing years to
   months excludes everything and reads as "search found nothing" (a plausible 0.35 precision).
2. The threshold is read at **module load**, so a sweep needs a real server restart per value.
   Kill by bound port — a wrong `pkill` pattern leaves one stale server answering every run and
   yields five identical scores that look like "the knob does nothing".

---

## Not in this plan

| Item | Why |
|---|---|
| Fix 12 / M-Fix 8 as a blocker | False premise. Drift is 108 lines of ticketing models; every planned model is byte-identical across all three schema copies. Reduced to Phase 0.2 item 3 |
| Fix 14, the AI Overview | Produced by neither agent. Needs an owner identified first |
| Explorer Map Tiers 2 and 3 | An abandonment decision, not cleanup. `trails.ts`, the server inference and the `trail` field stay |
| General prompt volume reduction | Unmeasurable until Phase 0.2 item 2 and Phase 4.3 report |
| New tool surface on either agent | The gaps are fields, not verbs |

---

## Where the value lands

| Phase | What a parent or merchant notices |
|---|---|
| **1** | The agent stops claiming a camp is rated 4.3, stops presenting relaxed results as matches, states real prices, and can undo a filter |
| **2–3** | "Highest rated" and "not in Holland Village" start working; prices carry their unit |
| **4** | The merchant agent stops losing track of what it just created; replies get faster |
| **5** | Merchants produce listings that are actually findable |
| **6** | Search starts understanding "somewhere calm for a shy 4 year old" |

Phase 1 alone removes three of the five SEV1 falsehoods, touches one repo, and needs no reindex or coordinated deploy. Start there.
