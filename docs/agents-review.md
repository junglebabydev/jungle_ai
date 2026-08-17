# Jungle AI Agents — Setup, Conversation Flow, Persona, and Where to Improve

**Date:** 2026-08-04
**Repo:** `jungle_ai`
**Scope:** the two brains — **merchant** (store configuration) and **concierge** (parent-facing discovery, two surfaces).
**Method:** read from the code at the commit above, not from memory. Figures measured, not estimated.

---

## Contents

1. [Current setup](#1-current-setup) — what the agents are built on
2. [Conversation flow](#2-conversation-flow)
3. [Personas](#3-personas)
4. [Where to improve](#4-where-to-improve) — prioritised
5. [Appendix](#appendix) — file map and measurements

---

## 1. Current setup

Both agents are **prompt + tool-calling loops over OpenRouter**. No agent framework, no
fine-tuning, no dedicated vector database. The LLM/search/WhatsApp transports are thin
`fetch` wrappers in `src/lib/` — deliberately no provider SDKs.

|                | **Merchant**                                                                                                                   | **Concierge** (two surfaces)                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Entry point    | `runMerchantTurn`                                                                                                              | `runProductDiscovery` (global) · `runMerchantLocationChat` (venue) |
| Model chain    | `AI_MODELS` — heavy-first (tool-heavy work)                                                                                    | `CONCIERGE_MODELS` — fast-first (latency is the constraint)        |
| Tools          | ~20 (`upsert_product`, `upsert_pricing`, `upsert_schedule`, `publish/unpublish/archive`, `get_product`, `list_my_products`, …) | 2 (`search_activities`, `get_activity_details`)                    |
| Writes         | Yes — every one behind a confirm card                                                                                          | **None.** Read-only                                                |
| Authorization  | RBAC + ownership re-checked in-process per tool                                                                                | None (public, user-anonymous)                                      |
| System prompt  | **~5,700 tokens**                                                                                                              | **~2,550** (global) · **~2,050 + venue profile** (venue)           |
| Prompt version | `systemPromptHash` only — **no version constant**                                                                              | `CONCIERGE_PROMPT_VERSION = "v2"`                                  |

### Shared plumbing (`src/ai/shared/`)

- **`guard.ts`** — defence in depth, _not_ the security boundary:
  `screenInput` (deterministic pre-model refusal) → `spotlightToolResult`
  (`<<UNTRUSTED_TOOL_DATA …>>` framing) → `createStreamRedactor` (128-char hold-back
  window makes streaming leak-proof) → `redactReply`.
- **`evalLog.ts`** — per-turn PostHog telemetry (cost, latency, tool trace, errors),
  emitted in `finally` so a failed turn is still recorded.

### The retrieval stack ("RAG")

There is no separate vector store. Retrieval is **Typesense hybrid search** in the
`search_engine` service:

```
concierge → search_activities → searchClient → search_engine
    keyword  (queryBy: productName, description, categoryName, merchantName, tags, …)
  + vector   (embedding, auto-embedded by ts/all-MiniLM-L12-v2, distance_threshold 0.5)
  → fused ids → Postgres hydration → result cards
```

The embedding is built from `productName, description, categoryName, locationName,
merchantName, merchantCategories, tags`. There is **no rerank stage** — the top hits the
model sees are fusion-ranked.

The model is shown only a **compact projection** of the results
(`SEARCH_PAGE_SIZE = 8`), while the frontend receives the full page
(`RESULTS_PAGE_SIZE = 20`) — so LLM cost stays flat as the grid grows.

---

## 2. Conversation flow

### 2.1 Merchant — a _transactional_ loop

The defining constraint: **one change per turn, applied only after the merchant clicks
Confirm.** A tool call only _prepares_ a change and surfaces a card; nothing is saved,
and the model does not get the new id back.

```text
Merchant message
      │
      ▼
  screenInput  ── prompt-extraction / rule-override? ──┐ blocked
      │ ok                                             └──▶ SAFE_REFUSAL
      ▼                                                     log + persist
  resolvePermissions(scope)  ║  capped history load      (parallel)
      │
      ▼
┌─ TOOL LOOP — bounded by MAX_STEPS + per-turn token budget ──────────┐
│                                                                     │
│  model emits a tool call?                                           │
│     │                                                               │
│     ├─ no ───────────────────────────────────▶ final reply ─────────┼──┐
│     │                                                               │  │
│     ├─ READ tool                                                    │  │
│     │    dispatchTool: Zod → ownership re-check → RBAC → run        │  │
│     │    spotlightToolResult  (frame as untrusted DATA)             │  │
│     │    └──────────────────── back into loop ──────────────────────┤  │
│     │                                                               │  │
│     └─ WRITE / sensitive tool                                       │  │
│          validate + assertResourceOwnership + preParkValidate       │  │
│          gate.createConfirmation → park AiPendingAction             │  │
│          CONFIRMATION_REQUIRED → card shown                         │  │
│          ══════════ TURN ENDS ══════════                            │  │
└─────────────────────────────────────────────────────────────────────┘  │
      ┌──────────────────────────────────────────────────────────────────┘
      ▼
  redactReply → persist USER + ASSISTANT turns → emitMerchantTelemetry (finally)


──── later, out of band ─────────────────────────────────────────────
  Merchant clicks Confirm
      → executeConfirmation(nonce)
      → re-derive scope from the conversation, re-check RBAC + ownership
      → execute (single-use nonce) → "✓ Done — …" note in the thread
```

> **The model's intent never re-enters at confirm time.** `executeConfirmation` rebuilds
> scope from the conversation and re-checks everything, so a jailbroken model still
> cannot widen what gets applied.

### 2.2 Concierge — global discovery

Far more deterministic scaffolding than the merchant loop. Note how much runs **before**
the model, and that a vague ask skips tool-selection entirely (one LLM call, not two).

```text
Parent message
      │
      ▼
  child-distress regex  (pre-model safety net)
      ├─ match ──▶ CONCIERGE_SAFETY_REPLY   (escalation-first, never model-dependent)
      │ no
      ▼
  screenInput ── blocked ──▶ CONCIERGE_SAFE_REFUSAL
      │ ok
      ▼
  load history + district matchers
      ▼
  accumulateContext — carry activity / age / area across turns
      ▼
  deterministic lifts — budget from message · age pinned · product type carried
      ▼
  isVagueAsk?   (nothing named, no filter chips)
      │
      ├─ YES ──▶ offer NO tools  +  CONCIERGE_OPENING_TURN
      │             │
      │             ├─ ONE model call ──────▶ clarifying question ──┐
      │             │                                       (parallel)
      │             └─ featuredResults ─────▶ curated grid ─────────┤
      │                  per-provider fetch, cached 5 min           │
      │                                                            ▼
      │                                        reply + featured grid
      │                                        results.featured = true
      │                                                            │
      └─ NO ───▶ offer search_activities                           │
                    ▼                                              │
                 model calls the tool with grounded fields         │
                    ▼                                              │
                 SERVER RE-GROUNDS every filter                    │
                   district / region / category / trail vocabulary │
                   + pins sections, productTypes, FE chips         │
                    ▼                                              │
                 search_engine hybrid search → cards               │
                    ▼                                              │
                 model summarises  (compact projection, top 8)     │
                    │                                              │
      ┌─────────────┴──────────────────────────────────────────────┘
      ▼
  grid empty?
      ├─ yes ──▶ guaranteeResults ladder — stop at the first non-empty step
      │            1. parsed activity term, keep every pin
      │            2. filter-only browse (no activity term)
      │            3. relax the TOPIC, keep the hard scope (age + area)
      │            4. relax scope too → flag broadened = true
      │ no
      ▼
  redactReply  +  strip any stray SUGGESTIONS line
      ▼
  persist off the critical path · emitConciergeTelemetry
```

### 2.3 Concierge — per-venue guide

A white-labelled surface pinned to one provider. The venue profile is **preloaded**, so
it can answer without searching — and must never dead-end on an empty catalogue.

```text
Parent opens a provider card
      ▼
  buildVenueContext — merchant + location + published catalogue
                      cached per (merchant, location)
      ▼
  ABOUT block injected into the prompt
  (wrapped in <<UNTRUSTED_TOOL_DATA …>> markers — data, never instructions)
      ▼
  what is the parent asking?
      │
      ├─ "what do you offer?" ─────▶ answer FROM the ABOUT block
      │                              name 2-4 real activities + age ranges
      │                              no search needed
      │
      ├─ price / dates / spots ────▶ get_activity_details
      │  / packages                  exact public specifics for ONE activity
      │
      ├─ filter a long catalogue ──▶ search_activities
      │                              HARD-limited to this merchant + location
      │
      └─ "another provider?" ──────▶ decline warmly
                                     ONE PROVIDER ONLY — never a directory
      │
      ▼
  reply + SUGGESTIONS chips
      ▼
  scope confinement checked → redactReply
```

> **Empty catalogue is an explicit failure mode the prompt guards against.** If nothing
> is listed, the guide leads with who the place is for, hours, rating and contact —
> never _"there's nothing here"_.

---

## 3. Personas

### Concierge (shared verbatim across both surfaces — `promptShared.ts`)

> _"You are Jungle Concierge, a warm, capable guide who helps parents in Singapore
> discover kids' activities (classes, camps, drop-ins). Draw out what the child loves and
> invite the parent to explore. Be personable and clear, never a robotic capability list,
> never an interrogation."_

Reply contract: a one-line lead, up to **three** `- ` bullets carrying _angles_ (trade-off,
fit, what to check) rather than a catalogue — the cards already show the results — then at
most one question. First mention of a provider in `**bold**`. No headings, tables, links,
emojis.

**Ethical spine (Jungle Explorer Map).** The framework maps **experiences, never the
child**: never score, rank, diagnose or label a child — including flattering labels; never
say a child is behind, weak or lacking; frame an untried trail as an _invitation_, never a
gap. Personalise only from what the parent said **in this chat**.

The venue surface adds a hard boundary: _"ONE PROVIDER ONLY… you have no knowledge of any
other business"_ — no comparing, no redirecting, even if asked directly.

### Merchant

> _"the jungle.baby setup assistant for the merchant "X" — a warm, professional helper
> (like a friendly, capable human assistant)… personable and human, but concise and clear.
> Never a cold, robotic capability list."_

Distinctive rules: **show outcomes, never internal process** (no _"let me pull that up"_,
no _"that didn't stick"_, no self-correction narration); never reveal internal ids —
refer to items by name; default to markdown **tables** for anything shown; end every reply
with a `SUGGESTIONS:` chip line.

**Assessment: the personas are not the problem.** Both are specific, warm and
anti-generic, and the concierge's ethical framing is genuinely well-judged. The issue is
_rule volume around them_ — see §4②.

---

## 4. Where to improve

Ordered by expected value. ① is a prerequisite for honestly evaluating ② and ③.

### ① You cannot currently measure reply quality — fix that first

`tests/ai/concierge/eval/RESULTS.md` says so itself:

> ⚠️ _"**NOT valid:** the Full (judged) column and any ranking from it — with the assumed
> data absent, the grader fails **honest** replies… it measures **catalogue coverage ×
> rubric interaction, not model quality**."_

| Signal                   | Value                | Trustworthy?                         |
| ------------------------ | -------------------- | ------------------------------------ |
| Deterministic invariants | **367/373 (98%)**    | ✅ Yes — the mechanics are excellent |
| Reply quality (judged)   | 274/373 (73%)        | ❌ **No** — sparse local catalogue   |
| Latency / cost           | 3.2s · $0.84 per run | ✅ Yes                               |

**Action:** point `CONCIERGE_EVAL_MERCHANT_ID` / `CONCIERGE_EVAL_LOCATION_ID` at the
indexed dev catalogue and re-run `npm run eval:concierge:ab`. Until then every
conversational change is unmeasurable.

The merchant eval is in worse shape: **15 scenarios, June 2026**, and its own header notes
the category names predate a reorg and need regenerating.

### ② Prompt volume, not persona, is the main quality lever

The merchant prompt is **~5,700 tokens of largely negative constraints** — roughly 40
`NEVER` / `DON'T` rules, visibly accreted one incident at a time. That predicts exactly the
failure the eval shows: **`memory` is the weakest dimension for every model tested** (the
only one no model aces).

| Model                   | Pass  | discipline | lifecycle | **memory** |
| ----------------------- | ----- | ---------- | --------- | ---------- |
| `gemini-2.5-flash`      | 14/15 | 7/7        | 4/4       | **3/4**    |
| `deepseek-v4-pro`       | 13/15 | 6/7        | 3/4       | **4/4**    |
| `gemini-3.1-flash-lite` | 12/15 | 6/7        | 4/4       | **2/4**    |
| `claude-haiku-4.5`      | 9/15  | 7/7        | 2/4       | **0/4**    |

Two moves:

- **Make conditional rules conditional.** The concierge's Explorer Map block is ~40% of
  the discovery prompt but applies only to _exploratory_ asks. `CONCIERGE_OPENING_TURN`
  already proves the composition pattern — extend it. Same for the merchant's
  schedule/camp-option mechanics, irrelevant until one is being built.
- **Move invariants from prompt into code.** _"Never create duplicates"_, _"always call
  `list_my_products` before publish"_, _"never show internal ids"_ are **checks**, not
  instructions. Every rule enforced deterministically stops competing for the model's
  attention — which is precisely why the concierge's deterministic score is 98%.

### ③ Retrieval is the weakest link for _result_ quality

`ts/all-MiniLM-L12-v2` is a small, general-purpose, English-only encoder with no notion of
this domain. For _"somewhere calm for a shy 4-year-old"_ it has little to work with.
Cheapest first:

1. **Enrich the embedded text at index time.** Today it embeds raw merchant copy. Adding
   derived signals — trail themes, age band as words (_toddler_, _preschooler_), format
   (_weekly_, _holiday_), indoor/outdoor — costs one reindex and directly lifts semantic
   recall.
2. **Add a rerank stage.** Hybrid fusion has no cross-encoder; reranking the top ~50 would
   raise precision more than any prompt edit.
3. **Query expansion.** The model already strips to a bare term. Expanding _"shy"_ →
   calm / small-group / gentle before search beats asking the model to describe poor
   results more nicely.

### ④ Small but real defects

- **Typo in a load-bearing prompt** — `merchantSystemPrompt.ts:75`:
  `"NEVER YOUR  NTERNAL PROCESS"` (missing `I`, double space), inside the section
  governing tone. One-character fix.
- **No merchant prompt version.** The concierge has `CONCIERGE_PROMPT_VERSION` and
  telemetry attributes on it; the merchant has only `systemPromptHash`, so a quality
  change can't be attributed to a prompt revision.
- **The schema mirror is stale.** `npm run check:schema` reports jungle_ai's
  `prisma/schema.prisma` drifting ~108 lines from booking's canonical copy. Unrelated to
  prompts, but it means the generated client can be silently wrong against the live DB.

---

## Appendix

### File map

| Concern                         | Path                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Merchant loop / gate / dispatch | `src/ai/assistants/merchant/{loop,gate,dispatch,ownership}.ts`                                |
| Merchant prompt                 | `src/ai/assistants/merchant/merchantSystemPrompt.ts`                                          |
| Concierge loop                  | `src/ai/assistants/concierge/loop.ts`                                                         |
| Concierge prompts               | `src/ai/assistants/concierge/{promptShared,productDiscoveryPrompt,merchantLocationPrompt}.ts` |
| Concierge tools                 | `src/ai/assistants/concierge/tools/{search,activityDetails}.ts`                               |
| Featured shop window            | `src/ai/assistants/concierge/featuredBrowse.ts`                                               |
| Venue preload                   | `src/ai/assistants/concierge/venueContext.ts`                                                 |
| Guard + telemetry               | `src/ai/shared/{guard,evalLog}.ts`                                                            |
| Model chains                    | `src/lib/openrouter.ts`                                                                       |
| Evals                           | `tests/ai/{merchant,concierge}/eval/`                                                         |

### Measured figures

| Metric                    | Value                           | How                                      |
| ------------------------- | ------------------------------- | ---------------------------------------- |
| Merchant prompt           | 22,624 chars ≈ **5,656 tokens** | rendered prompt, ÷4                      |
| Discovery prompt          | 10,215 chars ≈ **2,554 tokens** | rendered prompt, ÷4                      |
| Venue prompt              | 8,215 chars ≈ **2,054 tokens**  | excludes the venue profile block         |
| Concierge model → FE page | 8 → 20 results                  | `SEARCH_PAGE_SIZE` / `RESULTS_PAGE_SIZE` |
| Per-call output cap       | 2,000 tokens                    | `OPENROUTER_MAX_OUTPUT_TOKENS`           |
| Vector distance threshold | 0.5                             | `TYPESENSE_VECTOR_DISTANCE_THRESHOLD`    |

### Tunables worth knowing

`CONCIERGE_HISTORY_LIMIT` (20) · `CONCIERGE_MAX_STEPS` (5) ·
`CONCIERGE_TURN_TOKEN_BUDGET` (80,000) · `CONCIERGE_SEARCH_FIRST` (off) ·
`CONCIERGE_FEATURED_PRODUCTS_PER_MERCHANT` (20) ·
`CONCIERGE_FEATURED_CACHE_TTL_MS` (300,000) · `CONCIERGE_FEATURED_IDS_TTL_MS` (60,000)
