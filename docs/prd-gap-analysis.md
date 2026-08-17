# PRD Gap Analysis: Concierge and Merchant Agents

**Date:** 2026-08-07
**Reviews:** PRD 1 (Jungle Concierge) and PRD 2 (Merchant Setup Agent), both v1.0, 2026-08-05
**Repos read:** `jungle_ai`, `search_engine`
**Method:** every claim below was checked against the code at the paths cited. Nothing here is taken from the PRDs on trust.

> **Status, 2026-08-11.** Both PRDs are now at v1.1 and have absorbed most of Parts I and II. Read **Part III** first: it is the only section written against v1.1, and it contains the findings neither document covers.

---

## Contents

1. [Summary](#1-summary)
2. [PRD claims that hold](#2-prd-claims-that-hold)
3. [Where the PRDs understate the current state](#3-where-the-prds-understate-the-current-state)
4. [Gaps and recommended fixes](#4-gaps-and-recommended-fixes)
5. [Defects in the PRD documents themselves](#5-defects-in-the-prd-documents-themselves)
6. [Recommended order](#6-recommended-order)
7. [Appendix: file and line references](#7-appendix-file-and-line-references)
8. [Explorer Map: do Tier 1 only](#8-explorer-map-do-tier-1-only)
9. [Prompt sizes, measured](#9-prompt-sizes-measured)
10. [What the new design actually improves](#10-what-the-new-design-actually-improves)
11. [Recommended first move](#11-recommended-first-move)
12. [Part III: gaps in v1.1](#12-part-iii-gaps-remaining-in-v11) — **start here**

---

## 1. Summary

Both PRDs diagnose the agents accurately. Every SEV1 and SEV2 claim checked out against the code.

The one substantive correction is scope, not correctness: **`search_engine` already carries several capabilities the PRDs treat as unbuilt.** `priceFrom` is indexed for every product type, sourced from both the `Pricing` table and camp options, with partial coverage. A relevance-first two-key sort already exists. Coordinates are indexed and drive live proximity ranking. Five format flags the proposed state contract drops are indexed and filterable today.

That reframes the largest workstream. PRD 1 Fix 6 ("price visibility", described as the largest and most dangerous) is mostly a **projection and prompt change in `jungle_ai`**, not a cross-repo indexing epic. The price data exists; the model is simply never shown it.

The unifying diagnosis in both documents is right and worth restating:

> Four of the five SEV1 bugs are the same bug. The pipeline holds the truth, does not pass it to the model, and no prompt rule tells the model to stop. A fluent model with a gap in its input does not decline. It interpolates.

---

## 2. PRD claims that hold

Each verified in code.

| ID | Claim | Verification |
|---|---|---|
| B1 | The model never sees prices | `compactResults` projects `name, type, ages, area, provider, rating, reviews`. No price field. True as stated, but see §3 and §4.1: the price often exists in the index |
| B2 | No sort field exists | 0 matches for `sort` in `SearchToolInput` |
| B3 | `broadened` never reaches the model | `broadened` appears only at `loop.ts:417`. 0 occurrences in `compactResults`, `promptShared.ts`, `productDiscoveryPrompt.ts` |
| B4 | Negation is unexpressible | 0 matches for `excludeDistrict` / `excludeMerchantIds` |
| B5 | Conversation state is monotonic | The merge is `if (v !== undefined) acc[k] = v;`. No delete path |
| B6 | Budget applies to camps only | Confirmed at the filter, not at the data. See §3 and §4.2 |
| B13 | Venue rating presented as activity rating | `gMapRating` is on `model Location`, 0 occurrences on `model Product`. `search.ts:166` passes `p.location?.gMapRating` in a field named `rating` |
| B9 / M3 | Prompt typo | `merchantSystemPrompt.ts:75` reads `NEVER YOUR  NTERNAL PROCESS`, missing an I, double space |

**B13 deserves separate emphasis.** It is not triggered by an unusual query. It is on every result card of every search. Every activity at a venue carries the same number, so parents comparing camps are using a figure that cannot distinguish them.

---

## 3. Where the PRDs understate the current state

This section is the reason for the document. Each row changes the cost or sequencing of a planned fix.

| PRD position | Reality in `search_engine` | Consequence |
|---|---|---|
| Fix 6: index a price band. "Largest workstream, most ways to be subtly wrong" | **`priceFrom` is already indexed** — min over public, non-archived, non-`TRIAL` pricings (all types) and available non-`TRIAL` camp options | The indexing half is largely done. The remaining gap is the model projection, `priceType`, and free-vs-not-listed |
| Fix 6a warns of the `$5 from` trial trap | The indexer **already excludes `TRIAL`**, with a comment naming that exact trap | No new work |
| Fix 4b: two-key relevance-first sort is a new design | **Already implemented** for `cheap` and `near`: `_text_match:desc, priceFrom(missing_values: last):asc` | The pattern is proven in production. `ratingScore` slots into an existing shape |
| §2 non-goal 4: "No coordinates are collected". Distance out of scope | **`geo` geopoint is indexed**, with radius filtering and `geo(lat,lng):asc` distance sort. ~3% of locations lack coordinates | The non-goal is factually wrong and leaves a live capability ungoverned by any prompt rule |
| §7.1 omits `freeTrial`, `dropIn`, `termBased`, `meals`, `transport` | All five are indexed and filterable: `allowsTrial`, `allowsDropIn`, `isTermBased`, `mealIncluded`, `busIncluded` | Adopting §7.1 literally discards working, indexed capability |
| B6: other types "have no reliable indexed price" | `priceFrom()` reads **both** `product.pricings` (every product type) and `product.campOptions` (camps). Non-camp products are priced from the `Pricing` table whenever they carry a public, non-archived, non-`TRIAL` row. Coverage is partial, not absent | B6 is a filter-clause fix. The data is there for the products that have it |

**Correctly identified as absent:** no rating field of any kind is indexed. `gMapRating` appears only in `LocationDTOs`. PRD 1 Fix 4's `ratingScore` is genuinely new work.

---

## 4. Gaps and recommended fixes

Ranked by impact on what a parent sees.

### 4.1 Price exists in the index, but never in the model's input

The data is indexed and already drives the `cheap` sort. The only reason the agent cannot state a price is that `compactResults` does not project it.

**Coverage is partial, and the shape of the gap matters.** `priceFrom()` reads two sources — `product.pricings` for every product type, and `product.campOptions` for camps. A class, course, or programme carrying a public, non-archived, non-`TRIAL` pricing row **is** priced in the index. One with no such row resolves to `undefined`. So the projection will hand the model a real number for some products and `null` for others, within the same result set.

**Fix.** Add `priceFrom` to the model projection. One field in `search.ts`, plus prompt rules.

**Three conditions, all prompt-side:**

1. **Unit.** `priceType` is not indexed, and a figure without its unit is worse than no figure — `$320` meaning per-week versus per-session is a number a parent acts on. Until `priceType` is indexed, permit only `from $X` phrasing, never a bare figure and never a cross-product comparison.
2. **Null is not zero.** A `null` `priceFrom` means *not listed*, and the reply must say so rather than omit the product, guess, or imply it is free. This is PRD 1 Fix 6a rule 3, and partial coverage is precisely what makes it load-bearing rather than theoretical.
3. **Free is currently unrepresentable.** `products.ts:227` filters to `n > 0`, so a genuinely free product collapses to `undefined` — identical to having no pricing at all. Until that is fixed at the indexer, the model cannot state that anything is free, and the prompt must not let it infer freeness from a missing price. Fixing it needs a sentinel distinct from "absent"; treat it as part of the `priceType` stage, not this one.

**Sequencing.** This makes PRD 1 Fix 6 a two-stage change: project what exists now under rules 1–3, then index `priceType`, `hasMinimumSpend`, and a free-vs-absent distinction. The 50-product verification gate still applies to stage two — and should sample products with and without pricing rows, since that split is the risk.

### 4.2 Budget silently does nothing for four of five product types

`products.ts:509` keeps a non-camp product regardless of price. A parent filtering classes under $30 receives unfiltered classes while the carry note reports the budget as applied. Two false impressions from one clause.

The clause is not compensating for missing data. As §3 establishes, non-camp products carry `Pricing`-derived `priceFrom` values today, and the budget filter ignores them.

**Fix.** Apply the ceiling to any product that has a `priceFrom`, keeping the pass-through only for price-less documents:

```
(priceFrom:<=X || <no priceFrom present>)
```

**State the trade-off deliberately.** With partial coverage, this returns priced products within budget *plus* every unpriced product. That is the right default — dropping a product for lacking a pricing row would hide real inventory on a data artifact — but it means a budget-constrained result set is genuinely mixed, and the reply must not present the whole grid as "under $30". The prompt rule pairs with §4.1 rule 2: name the ones whose price is unknown rather than absorbing them into the filtered claim.

**Verification.** Pick a district with both priced and unpriced classes, query under a low ceiling, and confirm three things: priced-over-ceiling classes disappear, unpriced classes survive, and the reply distinguishes the two groups. Today only the third is even possible to get wrong, because the first never happens.

### 4.3 Venue rating presented as activity rating

See B13 in section 2.

**Fix, in two parts.** Rename the projection field to `venueRating` with `venueReviews` and require attribution in the reply ("the venue is rated 4.7 across 210 reviews"). This is a one-line correctness win available immediately, independent of `ratingScore`. Treat the shrinkage-weighted `ratingScore` and rating sort as the separate, later piece.

**Also:** add both field names to the §10.2 contract freeze, which currently omits them. See section 5.

### 4.4 `broadened` never reaches the model

The frontend labels a relaxed grid "no exact matches, nearby options". The agent, given no such signal, describes the same results as answers.

**Fix.** As PRD 1 Fix 2 specifies: have `guaranteeResults` record which constraints each step dropped, project `broadened` and `relaxed`, add the disclosure rule to `CONCIERGE_REPLY`.

Cheapest SEV1 removal in either document. One flag, one array, one prompt block, no service dependency.

### 4.5 State cannot be retracted, and the proposed contract is narrower than today's

Two problems. The retraction path does not exist (B5). Separately, PRD 1 §7.1 lists twelve keys where `accumulateContext` currently carries fourteen, dropping five format flags and adding `excludeDistrict`, `productType` and `sort`.

`productType` plausibly absorbs `dropIn` and `termBased`. **`freeTrial`, `meals` and `transport` have no replacement.** Implemented literally, "camps with meals included" followed by "any in Punggol" loses the meals filter — a new multi-turn bug introduced by the fix for multi-turn bugs.

**Fix.** Implement Fix 3's retraction as specified. Separately, restore the five keys to §7.1, or state explicitly that they are retired and accept that indexed fields go unused.

### 4.6 Ambiguous-area handling is specified and tested but never implemented

PRD 1 §7.2 requires that an ambiguous area ("Bukit" matches four planning areas) shows results across all matches, grouped and labelled, never silently picking one. §9.1 row 7 tests for it. No fix in §8 implements it, and there is no grouped-result handling in the code.

**Fix.** Either add an implementing fix, or move the launch-gate row to a later cycle. A gate with no implementation will either block release or be waived, and neither is useful.

### 4.7 Proximity is live but ungoverned

`geo` filtering and distance sort are in production while §2 declares distance out of scope, §7.3 states distance "must never be implied", and no prompt rule governs what the agent may claim about it.

A live capability with no capability statement and no guard is the exact shape that produces the other four SEV1s.

**Fix.** Re-scope the non-goal to match reality, then decide deliberately: either surface proximity with a disclosure rule, or disable the `near` path until it is specified. Do not leave it running and undocumented.

### 4.8 Merchant agent: the memory experiment is the highest-value single task

PRD 2 M-Fix 1 proposes that the memory failure is not prompt volume but that the model is never told the outcome of its own writes. `gate.ts:137` carries a comment showing someone already partly discovered this.

The hypothesis has never been tested and predicts the observed evidence exactly: memory uniformly weakest, discipline uniformly strong, weakest model failing hardest because it has least capacity to reconstruct state from a prose note.

**Fix.** Run it as specified, alone in its own commit, after the eval is regenerated. Either outcome is worth more than the change: it settles whether prompt volume is a quality lever or only a cost one.

---

## 5. Defects in the PRD documents themselves

Each of these would surface as a problem during implementation rather than review.

| Location | Defect | Fix |
|---|---|---|
| §10.2 contract freeze | Omits `venueRating` / `venueReviews`, which Fix 4a mandates and its acceptance test asserts. Both repos code against this freeze | Add both fields |
| §7.1 state contract | Drops five working filters with no rationale | Restore, or state the retirement explicitly |
| §7.2 item 2 | Specifies grouped ambiguous-area results that no fix delivers, yet §9.1 row 7 tests for it | Add a fix or move the test |
| §2 non-goal 4 | States coordinates are not collected. They are indexed and in use | Re-scope |
| §5, B7 | Cites section "3.7" for measurement. Measurement is §3.8; §3.7 is the merchant page surface | Correct the cross-reference |
| §7.3 item 4 | Ranks by "price, when a budget was given", but no fix specifies price as a relevance tiebreak. Fix 4c defines `priceAsc` as an explicit sort only | Specify or drop |

---

## 6. Recommended order

The grouping matters more than the list. Everything in stage 1 is `jungle_ai`-only: no service change, no reindex, no coordinated deploy.

### Stage 1 — removes three of five SEV1 falsehoods

| # | Change | Effect |
|---|---|---|
| 1 | Project `broadened` + `relaxed`, add the disclosure rule | Stops relaxed results being presented as matches |
| 2 | Rename `rating` to `venueRating`, require attribution | Stops a falsehood on every card of every search |
| 3 | Project `priceFrom`; "from $X" only; null means *not listed*, never free | Turns "I cannot see prices" into a real answer without inventing one |
| 4 | Retraction path in `accumulateContext` | Fixes the only failure a parent can see |

### Stage 2 — `search_engine`, one deploy

| # | Change | Effect |
|---|---|---|
| 5 | Budget clause applies wherever `priceFrom` exists | Budget stops silently doing nothing on four of five types |
| 6 | Index `priceType`, then `hasMinimumSpend` | Unlocks a figure with its unit. Verification gate applies |
| 7 | Index `ratingScore`, add `sort` | Unlocks truthful superlatives |

### Stage 3 — gated on data quality

Exclusions (Fix 5), then retrieval work (Fix 9), which is bounded by the completeness number from the capture contract. No prompt or reranking change lifts recall over empty merchant descriptions.

### Merchant agent, in parallel

M-Fix 0 (housekeeping and version constant), then M-Fix 7 (regenerate the eval), then M-Fix 1 (the memory experiment, alone). None of these touch the concierge.

---

## 7. Appendix: file and line references

Everything asserted above, with its location.

### `jungle_ai`

| Finding | Path |
|---|---|
| Model projection, no price, `rating` from location | `src/ai/assistants/concierge/tools/search.ts:159-167` |
| No `sort` / `excludeDistrict` in the tool input | `src/ai/assistants/concierge/tools/search.ts` |
| Additive-only state merge | `src/ai/assistants/concierge/loop.ts:307` |
| Carried keys, fourteen of them | `src/ai/assistants/concierge/loop.ts:285-308` |
| `broadened` set and never projected | `src/ai/assistants/concierge/loop.ts:417` |
| Prompt typo | `src/ai/assistants/merchant/merchantSystemPrompt.ts:75` |
| Rating on Location only | `prisma/schema.prisma:461`, absent from `model Product` |

### `search_engine`

| Finding | Path |
|---|---|
| `priceFrom` indexed, non-`TRIAL` minimum | `src/services/catalogue-index/collections/products.ts:89` and its comment |
| `priceFrom()` reads `pricings` (all types) **and** `campOptions` | `src/services/catalogue-index/collections/products.ts:210-229` |
| Free (`price` 0) collapses to `undefined` via the `n > 0` filter | `src/services/catalogue-index/collections/products.ts:227` |
| `geo` geopoint indexed | `src/services/catalogue-index/collections/products.ts:81` |
| Format and amenity flags indexed | `src/services/catalogue-index/collections/products.ts:92-96` |
| `daysOfWeek`, `timeOfDay` indexed | `src/services/catalogue-index/collections/products.ts:101-102` |
| Two-key relevance-first sort, already live | `src/services/catalogue-search/service.ts:233` |
| Budget clause, camps only | `src/services/catalogue-index/collections/products.ts:501-516` |
| No rating field indexed | absent throughout `src/services/catalogue-index/` |

---

## Part II: Explorer Map and prompt impact

Sections 8 to 11 answer two questions the review above raised but did not settle: what to do about the
Explorer Map, and what the proposed design costs and saves in prompt tokens. Every figure in them was
measured against the real prompt builders in `dist/`, not taken from the PRDs.

---

## 8. Explorer Map: do Tier 1 only

**Recommendation: adopt PRD 1 Fix 0 exactly as scoped — remove the parent-facing language, keep everything else.**

The reasoning is that the framework is unfinalised as a *product* while being fully built as *infrastructure*. Those two facts point in opposite directions, and Fix 0's tier split is the only approach that respects both.

### Why the parent-facing language should go

The frontend renders no trail chips, so the agent is the only channel through which an unfinalised vocabulary reaches parents. If the trails are later renamed, every conversation held until then used the old names.

Confirmed in code: `pinnedFilters.trail` is read at `tools/search.ts:274`, but nothing in `jungle_ai` ever sets it. Every `pinnedFilters` construction in `loop.ts` passes it through from the caller. The pin branch never fires.

### Why the rest must stay

The Explorer Map is one of the more completely wired features in the stack. It is not a prompt block with a stub behind it.

| Layer | Where |
|---|---|
| Typesense schema | `trails` `string[]` facet on **products** (`products.ts:54`) and **merchants** (`merchants.ts:44`) |
| Index population | `deriveExplorerMapTrails(...)` at `products.ts:341` |
| Filtering | `trails:=[...]`, OR-ed across trails, primary + also-builds (`products.ts:429-434`) |
| Query parsing | `trail?: string \| string[]` (`searchQueryParser.ts:41`) |
| Server inference | `inferExplorerMapTrailsFromText` overrides model args (`tools/search.ts:269-307`) |
| Complement search | `chooseComplementaryExplorerMapTrail` (`tools/search.ts:373-419`) |
| Tests | `productDiscoveryPrompt.test.ts`, `conciergeBinding.test.ts`, eval suite `explorer-map.mjs` |

Deleting Tiers 2 and 3 means a schema change on two collections plus a **full catalogue reindex**, and it removes a working filter dimension. That is an abandonment decision, not cleanup.

### What this means in practice

"Something social for my 5 year old" still filters correctly after Fix 0, because `tools/search.ts:269-307` infers the trail from the raw message server-side regardless of what the prompt says. **The filtering keeps working. The agent simply stops naming the framework.**

### The one real decision

Fix 0f is not a deletion. A parent asking "what should my 6yo focus on" currently gets the four trails walked as the plan. Delete that with no replacement and the request dead-ends, which is worse than the framework. PRD 1 day-one decision 9 needs an owner sign-off on the replacement wording before Fix 0 starts.

### The one real risk

Two of the eight bullets in the block are child-safeguarding rules with nothing to do with the framework — no scoring or labelling a child, no requesting name/school/medical details. Fix 0e extracts them to a standalone `ABOUT THE CHILD` block first. **Do that extraction before the deletion, with a prompt unit test asserting their presence**, or a severe regression ships silently.

---

## 9. Prompt sizes, measured

Token estimates use PRD 1's own ratio (10,215 chars → 2,576 tokens = 3.97 chars/token).

### Today

| Prompt | Chars | ~Tokens | PRD claim |
|---|---|---|---|
| Concierge discovery | **10,215** | ~2,576 | 10,215 — exact |
| — with a child profile | **11,973** | ~3,019 | not stated |
| Concierge venue chat | **8,287** | ~2,090 | 8,215 — matches |
| Merchant | **22,633** | ~5,707 | PRD 1: 22,624 ✓ · **PRD 2: 24,727 ✗** |

**PRD 2 overstates its own agent's prompt by ~2,100 chars (9%).** PRD 1 has the correct figure. Worth correcting, since M-Fix 2 is scoped against that number and the two companion documents currently disagree about the same prompt.

PRD 2's other headline number holds: **71** instances of never/don't/do not, counted case-insensitively, against the stated 73.

### After Fix 0

The Explorer Map block measures **3,992 chars = 39.1%** of the discovery prompt (PRD says 3,916 / 38% — accurate).

| | Before | After | Saved |
|---|---|---|---|
| Discovery | 10,215 (~2,576 tok) | ~6,223 (~1,569 tok) | **~1,000 tok/turn** |
| With child profile | 11,973 (~3,019 tok) | ~6,223 (~1,569 tok) | **~1,450 tok/turn** |

The profile saving is larger because the `Trail coverage:` lines disappear entirely.

### The merchant prompt is the bigger opportunity, and it is deferred

`MerchantContext` is `{merchantName, merchantId, locationId?}`. Nothing varies with conversation state, so **100% of 22,633 chars ships on every turn** — including camp-option mechanics for a merchant who only sells classes.

Sized the blocks M-Fix 2 targets:

| Block | Chars | % of prompt |
|---|---|---|
| ~~Lines mentioning package / membership~~ | ~~8,033~~ | ~~35.5%~~ **see correction below** |
| upsert_product details | 906 | 4.0% |
| Camp options | 747 | 3.3% |
| Pricing mechanics | 668 | 3.0% |
| Schedule mechanics | 352 | 1.6% |
| Product types | 281 | 1.2% |

**Correction (2026-08-11).** That 35.5% counted every line *mentioning* packages, and
those lines are core mechanics that happen to name them — the confirm gate, HIDE vs
REMOVE, the duplicate guard, the id-redaction rule. All apply to products equally.
There is **no separable package block**: no line in the prompt has packages as its
subject, and the genuinely package-specific text is ~2,600 chars spread across four
general rules that cannot be removed.

The real conditional opportunity is the **~2,954 chars (13.1%)** of type-specific
mechanics listed above — `upsert_product` details, camp options, pricing, schedule,
product types — each of which IS a single identifiable line. M-Fix 2 is worth roughly
a third of what this table originally implied, and PRD 2 v1.1 correction #2 (which
reordered M-Fix 2 to put packages first) rests on the same miscount.

The concierge, by contrast, is *already* conditional — `sectionClause`, `renderChildProfile`, and `CONCIERGE_OPENING_TURN` composed on `isVagueAsk`. The pattern M-Fix 2 wants to import already exists in the other brain.

### The economics point the other way from the sequencing

The cycle cuts 39% from the smaller, already-conditional prompt on day 1, and defers the larger, entirely static one until M-Fix 1 reports.

That is defensible — Fix 0 is a product decision, not a token optimisation, and PRD 2 correctly refuses to trim on a guess before its eval is repaired. But note that **the merchant chain is heavy-first (`AI_MODELS`) while the concierge is fast-first (`CONCIERGE_MODELS`, leading with `gemini-3.1-flash-lite`)**. The 5,707 static merchant tokens are billed at premium rates every turn; the 2,576 discovery tokens at the cheapest available. Per token saved, the merchant prompt is worth considerably more, which strengthens the case for running M-Fix 7 → M-Fix 1 promptly.

**Caveat on all of the above:** the system prompt is only part of a billed turn. History, 20 merchant tool schemas via `z.toJSONSchema`, and tool results sit on top and none of them shrink. These percentages are of the prompt, not of the turn.

---

## 10. What the new design actually improves

The gain is concentrated in **honesty**, not in **result quality**. The agent returns largely the same results, but stops making five classes of false claim about them. Relevance barely moves this cycle — Fix 9 is hard-gated on merchant data that does not exist yet.

### Five falsehood classes, by how often they fire

| Bug | Fires | Today | After |
|---|---|---|---|
| **B13** venue rating as activity rating | **every card of every search** | "this camp is rated 4.7" | "the venue is rated 4.7 across 210 reviews" |
| **B3** broadened shown as matches | every zero-result query | "Here are some great options for your toddler this weekend" | "No water play for toddlers this weekend. These are on other dates." |
| **B1** invented price | any price question | can produce a figure it never saw | honest decline, then a real figure with its unit |
| **B2** superlative guess | any "best / highest rated" | names the best of its 8 as best in the catalogue | true rating sort, scope disclosed |
| **B6** budget silently inert | any budget on a non-camp | carry note says applied; nothing was | actually applied |

B13 and B3 matter most — neither needs an unusual query to trigger.

**B6 is cheaper than the PRD assumes.** `priceFrom()` already reads `product.pricings` for every product type, so non-camp products carry indexed prices today wherever they have a public non-`TRIAL` row. Removing the camps-only restriction is a one-clause change in stage 1, not something gated on the reindex.

### Four query classes flip from broken to working

State mutation ("undo the price filter", Fix 3), superlative (Fix 4), negation (Fix 5), zero-result (Fix 2).

The §6 five-turn sequence currently produces **two false statements** and the wrong final state. After Fix 3 it is correct, and provable with pure unit tests and no model call — the cheapest thing in either PRD to verify.

### What will not improve

1. **Result relevance.** Fix 9 is gated on Fix 8. A cross-encoder scoring empty merchant descriptions reorders the same poor candidates.
2. **The merchant page's usefulness.** B14 — parking, what to bring, supervision, cancellation — needs the FAQ schema in M-Fix 6.
3. **Two query classes stay declined** (`bookingRequired`, `packageRequired`) by design, correctly, rather than being prompted around.

---

## 11. Recommended first move

Stage 1 is entirely `jungle_ai` — no service change, no reindex, no coordinated deploy — and removes three of the five SEV1 falsehoods:

1. Extract the safeguarding rules to `ABOUT THE CHILD` (Fix 0e) **first**, with a unit test.
2. Fix 0 Tier 1 deletion, once decision 9 signs off the plan-request replacement.
3. Fix 1 honesty guards.
4. Fix 2 broadened disclosure, and rename `rating` → `venueRating` / `venueReviews`.
5. Fix 3 removable state.
6. Project `priceFrom` (already indexed) and drop the camps-only budget clause.

Highest improvement per unit of risk in either document.


---

## 12. Part III: gaps remaining in v1.1

Written 2026-08-11 against PRD 1 v1.1 and PRD 2 v1.1, verified against `booking_system`,
`jungle_ai`, `search_engine`, the deployed `.env` chains, and the merchant eval results.
Everything in Parts I and II that v1.1 absorbed is not repeated here.

### 12.1 Correctness

#### C1. The relaxation ladder flags only its last rung — the biggest miss in either PRD

`guaranteeResults` has four rungs. **Only rung 4 sets `broadened`** (`loop.ts:417`). Rungs 2 and 3
relax the parent's ask and set nothing at all:

| Rung | Drops | Flagged? |
|---|---|---|
| 1 | nothing — the parsed activity term with all pins | n/a |
| 2 | **the activity term** | **no** |
| 3 | **`category` and `maxPrice`**, keeping age + district | **no** |
| 4 | age, area, region, every pin | yes |

Two consequences neither document states:

1. **The frontend is also lied to.** The "no exact matches, nearby options" label is driven by
   `broadened`, so a rung-2 or rung-3 result renders as an exact match on the grid as well as in
   the reply. B3 is not only a projection gap; it is a flag that is never set.
2. **`maxPrice` is silently dropped at rung 3.** A parent who set a budget can receive
   over-budget results with no disclosure to the model, the reply, or the grid. This is a third
   price falsehood, independent of B1 and B6, and it is listed in neither PRD.

**Resolution.** Fix 2 as written says "record which constraints each step dropped", which assumes
the flag is already being set on those steps. It is not. The fix must **set `broadened` on rungs 2
and 3 as well**, and populate `relaxed` from what each rung actually removed:

```
rung 2 -> relaxed: ["activity"]
rung 3 -> relaxed: ["activity", "category", "maxPrice"]
rung 4 -> relaxed: ["activity", "category", "maxPrice", "age", "area", "region"]
```

Add an acceptance case for rung 3 specifically: a query with a budget that falls through to rung 3
must state that the budget was dropped. Cheap, and it closes the last price falsehood in stage 1.

#### C2. Fix 12 / M-Fix 8 blocks both documents on a discrepancy that does not exist

PRD 1 Fix 12 cites `~/booking_system` at 1,405 lines omitting `gMapRating`, and
`~/projects/booking_system` at 2,175 lines. **Neither path exists.** Every 1,405-line schema on the
machine is a stale archive (`~/Downloads/booking_system-main 2|3|4`, `Jungle-migrate`, `V-1`).

Measured reality:

| File | Lines | `gMapRating` |
|---|---|---|
| `mcp/booking_system/prisma/schema.prisma` | **2,291** | yes, line 483 (+ `reviewCount` 484, `lat`/`long` 470-471) |
| `mcp/jungle_ai/prisma/schema.prisma` | 2,183 | yes, line 461 |
| `mcp/search_engine/prisma/schema.prisma` | 2,175 | — its own legitimate mirror, not a stale booking copy |

Drift is **exactly 108 lines**, which is what v1.0 said, and it is benign: `Ticket` (52 lines) and
`TicketRedemption` (20 lines) plus their enums exist in booking and not in `jungle_ai`, correctly,
because ticketing is not in its service closure. **Every model either PRD plans against is
byte-identical across all three copies** — `Location`, `Product`, `Pricing`, `CampOption`,
`BirthdayDetails`.

**Resolution.** Return B11 / M7 to SEV2. Keep only Fix 12 items 4 and 5 (retire the Downloads
archives, add `check:schema` to CI). Drop items 1 to 3, remove Fix 12 from both critical paths, and
reduce decisions 10 and M6 to "confirm `mcp/booking_system` is authoritative" — a five-minute check.
As written, both dependency graphs open with a blocker that is not there.

#### C3. The model has no stable way to refer to a result

`compactResults` projects `name, type, ages, area, provider, rating, reviews` and no identifier.
Two products sharing a name across providers are near-identical rows, and "tell me about the second
one" has nothing to anchor to. The merchant eval already records this failure shape on the other
brain: *"the first one" -> wrong id*.

**Resolution.** Project a per-turn ordinal (`ref: 1..8`) rather than a database id — it keeps the
existing id redaction intact, gives the parent's "the second one" a referent, and costs one integer
per row. Add it to the §10.2 freeze alongside `venueRating`.

### 12.2 Efficiency — absent from both PRDs

Neither document treats latency or search cost as a workstream. Four findings, in order of payoff.

#### E1. The merchant agent's real cost is latency, not tokens

Deployed chain is `AI_MODELS=deepseek/deepseek-v4-pro,google/gemini-3.1-flash-lite,...`.
From the eval:

| Model | Pass | memory | $/run | Latency |
|---|---|---|---|---|
| `deepseek/deepseek-v4-pro` (deployed lead) | 13/15 | **4/4** | $0.0632 | **446s** |
| `google/gemini-2.5-flash` | **14/15** | 3/4 | $0.1178 | 139s |
| `google/gemini-3.1-flash-lite` | 12/15 | 2/4 | $0.0919 | 131s |

The lead model is **3.4x slower** than either Gemini while scoring one point lower than
`gemini-2.5-flash` overall. PRD 2 discusses prompt tokens at length and never mentions this.

**Resolution.** Make the model chain an explicit decision in M-Fix 7's scope, measured on the
regenerated eval. Trimming 35% of a prompt saves a fraction of a second; the chain choice is worth
minutes per conversation.

#### E2. `deepseek-v4-pro` already aces memory, which reframes M-Fix 1

RESULTS.md is explicit: *"Only `deepseek-v4-pro` clears all four."* That is the **deployed lead**.
PRD 2 makes M1 the top SEV1 and M-Fix 1 "the highest information-per-hour task in either PRD",
citing Haiku's 0/4 — but Haiku is not deployed.

In production, memory failures are a **fallback** problem: they surface when deepseek 429s or 5xxs
and `gemini-3.1-flash-lite` (2/4) takes over.

**Resolution.** M-Fix 1 is still worth running — fallback is real and the experiment settles the
prompt-volume question — but its expected parent-visible effect is smaller than stated, and it
should not outrank C1 or Fix 6 stage 1. Also consider the cheap interim: reorder the fallback chain
so the second position is a model that scores 3/4 or better on memory.

#### E3. Search results are not cached, while the featured browse is

`featuredBrowse.ts` uses `LruTtlCache` with single-flight loading and a composite key
(`sections | constraints | merchantIds`). `tools/search.ts` has no caching at all.

So the vague-ask path — the cheap one — is cached, and the real search path is not. Identical
searches across turns and across parents each pay a full Typesense round-trip plus Postgres
hydration of 20 cards.

**Resolution.** Reuse `LruTtlCache` in `search_activities`, keyed on the fully-grounded
`StructuredSearchInput` (after server re-grounding, so the key is canonical). Short TTL, 60 to 120s,
which is well inside the nightly reindex cadence. The single-flight behaviour also collapses the
stampede when several parents search the same thing at once.

#### E4. A zero-result query costs up to five serial round-trips

The model's own search, then up to four ladder rungs, each a full
`search_activities.run()` — re-grounding, Typesense, Postgres hydration of `RESULTS_PAGE_SIZE = 20`.
All strictly sequential.

**Resolution, in order of cheapness:**

1. **Short-circuit rung 1.** When `parseSearchQuery` yields no activity term, `term` is empty and
   the loop already runs only `""` — but rungs 2 and 3 then differ solely by which pins survive.
   Run rung 3's scoped browse only when rung 2 actually had pins to drop.
2. **Cache (E3) makes rungs 2 to 4 nearly free** on repeat, since they are low-cardinality browses.
3. **Request fewer cards on the diagnostic rungs.** Rungs 2 and 3 exist to answer "is anything
   there", so `pageSize: 1` would answer it, with the full fetch only on the rung that wins.

#### E5. `accumulateContext` re-parses the entire history every turn

`loop.ts:285` runs `parseSearchQuery` over every user message in history plus the current one, with
district matchers, on every turn. `CONCIERGE_HISTORY_LIMIT` is 20, so a long conversation re-parses
20 messages to recompute a state object that changed by at most one message.

**Resolution.** This becomes materially more attractive alongside Fix 3, which must reprocess
history anyway to apply retractions in order. Persist the accumulated state on the
`ConciergeConversation` row and apply only the new message per turn, replaying from scratch only
when the schema version changes. Do it **with** Fix 3, not before — retraction ordering is the
harder half and a cached state that ignores retractions would be worse than the current cost.

### 12.3 A correction to Part II that PRD 2 adopted

Part II argued the merchant prompt bills at "premium rates", and PRD 2 v1.1 took it up as
correction #9. The actual rates make this **half right, and the framing wrong**:

| | input $/M | output $/M |
|---|---|---|
| `deepseek-v4-pro` (merchant lead) | **0.43** | 0.87 |
| `gemini-3.1-flash-lite` (concierge lead) | **0.25** | 1.50 |

A system prompt is input tokens, so merchant prompt tokens do cost **1.7x** concierge prompt tokens
— the "per token saved, worth more" conclusion holds. But `deepseek-v4-pro` is the *cheapest* output
rate in the table and is cheaper per run overall ($0.0632 vs $0.0919), so "premium rates" is wrong
as a general statement. Restate PRD 2 correction #9 as: **merchant prompt tokens are 1.7x concierge
prompt tokens on the input rate; the merchant agent's dominant cost is latency, not dollars.**

### 12.4 Revised first move

Reordered from §11c on the findings above. All `jungle_ai`, no reindex, no coordinated deploy.

| # | Change | Why here |
|---|---|---|
| 1 | Extract safeguarding rules to `ABOUT THE CHILD`, with a unit test | must precede any Fix 0 deletion |
| 2 | Fix 0 Tier 1, once decision 9 is signed off | shrinks the file every later fix edits |
| 3 | Fix 1 honesty guards | the safety net for the cycle |
| 4 | **C1 — flag rungs 2 and 3, populate `relaxed`** | **closes B3 properly and the third price falsehood** |
| 5 | Fix 4a-0, rename to `venueRating` / `venueReviews` | falsehood on every card, one line |
| 6 | Fix 6 stage 1, project `priceFrom`, drop the camps-only clause — and replace Fix 1a's wording in the same commit | 1a says "you never see prices" and stage 1 hands it prices |
| 7 | Fix 3 removable state, five format keys restored, plus E5 | shared history-replay work |
| 8 | Fix 11, project `BirthdayDetails` / `DropInDetails` | real answers already in the database |
| 9 | C3, per-turn `ref` ordinal | one integer, unblocks "the second one" |
| 10 | E3, cache `search_activities` | largest efficiency win, no behaviour change |

Fix 12 does **not** lead this list. Per C2 it is a five-minute confirmation, not a blocker.
