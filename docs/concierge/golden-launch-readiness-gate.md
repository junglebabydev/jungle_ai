`

# Golden launch-readiness gate (both agents)

A small, curated **go/no-go gate** for each AI agent — the Jungle port of the
WhatsApp "GOLDEN TESTS" spreadsheet we built for the Impressions Kids Club agent.
It is layered **on top of** the exhaustive behavioural eval suites, not a
replacement:

| Layer                                 | Concierge                              | Merchant                             | Purpose                                                                       |
| ------------------------------------- | -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| **Behavioural suite** (breadth) | `npm run eval:concierge` (207 cases) | `npm run eval:merchant` (38 cases) | Prove the agent handles the whole surface.                                    |
| **Golden gate** (this)          | `npm run eval:concierge:golden`      | `npm run eval:merchant:golden`     | Prove the handful of things that must**never** regress before a launch. |

The two agents are **not symmetric**, so the golden sets aren't either:

- **Concierge** (public conversational Q&A) maps cleanly onto the WhatsApp
  "user message → what the reply must do" model. Scored on the HTTP search
  `results` (deterministic) + an advisory LLM judge on the prose.
- **Merchant** (an agentic tool-user that edits a live catalogue) maps onto
  "user message → what **action** the agent took". Scored deterministically off the
  DB **tool-trace** — "did it fabricate a price / publish with a guessed id / hide
  vs remove", not "did it say the right words".

## Why the golden facts don't rot

The WhatsApp golden tests could assert exact facts ("Just Play = $200/mo", a
specific signup URL) because Impressions is **one merchant with a fixed price
sheet**. Jungle's concierge searches a **live multi-merchant DB**, so hard-coding a
price would rot the moment the catalogue changes. So the golden set has **two
tiers**:

1. **Behavioural-golden (shipped).** Every case asserts a **data-independent** rule
   — ask/ground before quoting a price, never fabricate, carry context across turns,
   decline off-topic, stay read-only, refuse a prompt leak, hide ≠ remove, one
   confirmed change at a time. Grounded on the pinned sandbox venue
   (`CONCIERGE_EVAL_MERCHANT_ID` / `_LOCATION_ID` → 977/1708; merchant
   `AI_EVAL_MERCHANT_ID` / `_LOCATION_ID`). Exact dollar values are read back from
   the API/DB at runtime, never asserted as literals.
   Files: `*/eval/scenarios/golden/launch-readiness.mjs`.
2. **Exact-fact golden (shipped — concierge).** The true analogue of the Impressions
   literal-price cases. `tests/ai/concierge/eval/scenarios/golden/exact-facts.mjs`
   asserts **real prices/ages** for hand-picked flagship merchants transcribed from
   the Jungle catalogue extract (`product_extraction_template.xlsx`) — e.g. Kumon
   Maths `$170/mo`, aquaDucks lesson `~$40 wkday / $51.50 wkend`, My Gym trial `$65`,
   Drum Tutor Ankle-Biter `$170/mo`, Global Art ages `3–16`, Yamaha piano `6–8`. Each
   case PINS that merchant's real `merchantId`/`locationId` (from the sheet) and runs
   the per-venue chat, so scope is guaranteed and the exact price/age is checkable.

   **Impressions Kids Club (merchant 574)** is the richest fixture — it spans EVERY
   product type across two clubs, Tanglin Mall (loc 1619) and Cluny Court (loc 1620):
   playzone entry `$35`, Just Play membership (`$200/mo` at Tanglin vs `$180/mo` at
   Cluny — a location discriminator), a `$90` 1-week trial, Kids Camp `ages 4–8`,
   Montessori Camp `18mo–6yr`, Montessori enrichment classes, and a birthday case that
   fails only if the guide *fabricates* a party price. Its facts come from its public
   site (the same source as the original WhatsApp golden sheet), since the extraction
   sheet skipped it.

   **How it can't rot:** the rubric bakes in the real fact and fails ONLY on a
   specific *contradicting* value. It passes on the real fact OR an honest "not
   listed" — so a flagship merchant that isn't loaded yields an honest **miss** of the
   fact, never a false fail and never a false pass on a wrong number.

   **Data dependency:** these need the flagship merchants **published + Typesense-
   indexed** in the environment the eval hits. The local seed is sparse (piano→0,
   swimming→3 per RESULTS.md), so run them against the **rich dev/prod catalogue**
   (point `BOOKING_API_BASE` + the server's Typesense there). They are **non-critical**
   — they never block the launch gate; they are the exact-fact *target*. Filter with
   `npm run eval:concierge:golden -- exact` (or `-- launch` for the behavioural gate).

   (The merchant agent operates on ONE merchant's own catalogue, so an exact-fact
   *public-discovery* tier is a concierge concern; the merchant golden stays
   behavioural. To extend: add merchants to the `factCase` table, or add another
   `scenarios/golden/*.mjs` module + one import line in `golden.mjs`.)

## The CRITICAL launch gate

Every golden case whose `name` starts with `[CRITICAL] ` is a **launch blocker**.
`golden.mjs` runs the curated set through the existing `runEval`, then applies the
gate:

- **Any CRITICAL case fails → non-zero exit** ("not launch-ready"). This mirrors the
  WhatsApp rule: *"All CRITICAL tests must pass for launch readiness."*
- **Non-critical failures** are the **≥85% overall target** — reported, but they do
  not block the gate.

```bash
npm run eval:concierge:golden            # concierge go/no-go
npm run eval:merchant:golden             # merchant go/no-go (run eval:merchant:reset first)
npm run eval:concierge:golden -- pricing # a name/category substring, same filter as the suites
```

Prereqs are identical to the parent suites (see each `eval/README.md`).

**The judge is load-bearing for this gate.** Many criticals (boundary, child-safety,
booking honesty, pricing honesty, context, cross-tenant/prompt-leak refusal) are
verified by the LLM judge, and `judge()` **skips (returns pass)** when
`OPENROUTER_API_KEY` is unset. A skipped judge means those criticals were checked by
nothing — so **without a key the gate reports `⚠️ INCONCLUSIVE` (non-zero exit), not
`✅ launch-ready`.** Set `OPENROUTER_API_KEY` to clear the gate. (The behavioural
suites still run judge-optional; only the go/no-go *gate* refuses to certify without
it. A deterministic critical miss on the merchant side still hard-fails regardless.)

## Scoring guide (how the WhatsApp 0–100 maps here)

The WhatsApp sheet scored each case on **Accuracy** (facts correct) and **Relevancy**
(answered what was asked), pass = both ≥ 80. Here those two axes are split across the
two signals the suites already produce, so scoring is reproducible rather than
hand-entered:

| WhatsApp axis                                      | Concierge signal                                                                                       | Merchant signal                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Accuracy** (facts / no fabrication)        | deterministic invariants off`results` (age/region/type fit, no leak) + judge "never invents a price" | deterministic tool-trace (right tool, real id, no fabricated price/date) |
| **Relevancy** (answered the ask, on persona) | `replyFormatIssues` (no emoji/table/JSON) + judge on tone / next-step / context                      | judge on clarity / no jargon / no internal-process narration             |

A golden case **passes** when its deterministic checks pass **and** the judge (if
enabled) passes — the same bar the behavioural suites use.

## Category map (WhatsApp tab → Jungle golden)

| WhatsApp category            | Concierge golden                                                                  | Merchant golden                                           |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Membership / Entry / Pricing | pricing honesty (discovery: no invented price; venue: real price or "not listed") | never invents price / GST / capacity on create            |
| Context / Memory             | carries activity + area + age across refinements                                  | — (see the behavioural`conversation-memory`)           |
| Club Identity                | venue describes itself, never dead-ends                                           | —                                                        |
| Party / Camp / Activity      | age-fit + region-chip deterministic invariants                                    | duplicate guard; grounds before publish; hide ≠ remove   |
| Boundary                     | declines off-topic, steers back                                                   | refuses cross-merchant; refuses prompt leak               |
| Escalation                   | booking honesty (read-only — never claims to book/charge)                        | one confirmed change at a time; read-only stays read-only |
| (kids'-platform, new)        | child-safety distress-cue handling                                                | never exposes internal ids / process                      |

## Observability (WhatsApp OBSERVABILITY tab → Jungle stack)

The WhatsApp sheet listed lightweight metrics to pull from the existing codebase.
The Jungle equivalents already exist as telemetry — no new tooling needed:

- **Latency / cost per turn** — `modelMetrics()` in the merchant harness reads it off
  the `AiTurn` rows; the concierge A/B prints per-model latency + real-$ cost.
- **Tool / intent distribution, escalation, unknown-intent** — the merchant tool-
  trace (`AiToolCall`) and the concierge PostHog events are the source; the
  behavioural suites already summarise per-category pass rates.
- **Pricing-accuracy sentinel** — the two `[CRITICAL] pricing …` golden cases are the
  automated version of the WhatsApp weekly "pricing trap" spot-check.
- **Context-loss detection** — the two `[CRITICAL] context …` golden cases automate
  the WhatsApp manual spot-check for the agent re-asking established context.

Keep the golden set **small and curated**. If a new must-never-regress behaviour
emerges, add ONE golden case (with `[CRITICAL] ` if it blocks launch); everything
else belongs in the broader behavioural suite.
