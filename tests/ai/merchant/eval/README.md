# Merchant-agent eval suite

On-demand, behavioural evals for the merchant-config AI agent (`src/ai/assistants/merchant`).
They drive scripted "dumb merchant" conversations through the **real `POST /ai/chat`**
and score **deterministic invariants** read back from the DB tool trace (`AiToolCall`)
and the resulting `Product` / `Merchant` / `Location` rows — so the prose can be
non-deterministic while scoring stays reproducible.

Not part of `npm test` and not type-checked: it costs OpenRouter tokens and needs
the dev DB, so it runs deliberately as an ops script.

## What's in this folder

| File / folder | What it is (plain English) |
|---|---|
| **`scenarios/`** | **The tests.** Each file holds a set of conversations + how each is graded. Grouped by `capability/` (can it do it), `conversation/` (multi-turn), `safety/` (guardrails, grounding, security). Start here. |
| **`run.mjs`** | **▶ Runs the eval.** This is what `npm run eval:merchant` calls. |
| `all-scenarios.mjs` | Gathers every test from `scenarios/` into one list for the runner. |
| `engine.mjs` | The machinery: talks to the AI, reads back the DB, and decides pass/fail. You don't run it directly — scenarios import their grading helpers from it. |
| `compare-models.mjs` | Run two AI models side by side (`npm run eval:merchant:ab`). |
| `reset.mjs` | Cleans up the sandbox data a run created (`npm run eval:merchant:reset`). |
| `list-questions.mjs` | Prints every question (add `--json`). Does NOT call the AI. |
| `README.md` / `RESULTS.md` | This file / scores from the last run. |

## Run

```bash
npm run eval:merchant:reset                  # clear the sandbox first (recommended before a fresh run)
npm run eval:merchant                        # every case
npm run eval:merchant -- safety              # a whole dimension (safety-*)
npm run eval:merchant -- capability          # capability-*
npm run eval:merchant -- safety-security     # one file
npm run eval:merchant -- onboarding          # …or a name substring
node tests/ai/merchant/eval/run.mjs          # equivalent (no npm)
```

The arg matches a **category substring** or a name substring. Because every category
is `<folder>-<file>`, one arg selects a whole dimension (`safety` → every `safety-*`),
a theme, or one file. Exit code is non-zero if any case fails (CI-friendly).

`npm run eval:merchant` only RUNS scenarios — it no longer cleans up after itself, so a
failed run's `Eval *` artifacts stay inspectable. `npm run eval:merchant:reset` is the single
cleanup command: it hard-deletes every `Eval *` product (and its config children:
details, pricing, schedules, sessions, camp options), every `Eval *` package
template, and all AI conversation logs for the sandbox merchant. It is **local
only** (refuses any non-localhost `DATABASE_URL`) and scoped to
`AI_EVAL_MERCHANT_ID` / `AI_EVAL_LOCATION_ID`. Run it before a fresh run for a clean
slate — otherwise prior `Eval *` products are still active and the duplicate-create
guard will block re-creating the same names.

## Naming convention (so the folder reads itself)

- **Folder = dimension.** `capability/` (can it do it), `conversation/` (multi-turn),
  `safety/` (guardrails / grounding / robustness / security).
- **File = kebab-case theme noun.** `product-builds.mjs`, `tool-coverage.mjs`, `guardrails.mjs`.
- **Category = `<folder>-<file>`, exactly.** `capability/product-builds.mjs` →
  `capability-product-builds`. Mechanical category ↔ file, predictable filter.

## Layout (the scenarios)

```
scenarios/
  capability/         can the agent DO it
    onboarding.mjs       fresh-merchant setup, focused vertical slices
    product-builds.mjs   CAMP / BIRTHDAY / DROP_IN + camp-options + package-kinds + remove/restore (was "lifecycle")
    tool-coverage.mjs    every tool / every product-type dispatch arm (was "coverage")
  conversation/       multi-turn coherence
    memory.mjs           coreference, refinement, follow-up, recall
  safety/             guardrails + grounding + robustness + adversarial
    guardrails.mjs       agent-contract guardrails (rule 06) (was "discipline")
    grounding.mjs        anti-hallucination + response quality (LLM-as-judge)
    robustness.mjs       messy input / disambiguation / recovery
    security.mjs         adversarial: injection, jailbreak, gate-bypass, leaks
```

## Evaluation dimensions

The standard agent-eval dimensions, grouped into the three folders:

| Dimension | Where | What it proves |
|---|---|---|
| **Capability** | capability/{onboarding,product-builds,tool-coverage} | tool selection, argument/schema adherence, task completion across every tool + product type |
| **Conversation** | conversation/memory | multi-turn coreference / refinement / fresh-recall |
| **Safety** | safety/{guardrails,grounding,robustness,security} | the agent contract, anti-hallucination, messy-input recovery, and the adversarial surface (injection / jailbreak / gate-bypass / leaks / cross-tenant) |

Scoring is deterministic off the DB tool-trace and resulting rows; `safety-grounding`
adds an LLM-as-judge for reply-quality checks (skipped, pass, without `OPENROUTER_API_KEY`).

## How scoring reads the agent (facts that shape every check)

- **Every write tool is gated.** The loop parks anything `sensitive: true` — that is
  ALL data-mutating tools (create/edit/publish/unpublish/archive/unarchive, product
  AND package), not just publish/archive. A parked call is logged as a
  `gated=true`, `isError=true`, `CONFIRMATION_REQUIRED` row and is **never executed
  in the loop**. So a write's INTENT lives in its gated row — assert writes with
  **`attempted`** (matches the gated row), NOT `ok` (which needs a non-error row).
  `ok` is for ungated reads only (`get_*` / `list_*` / `describe_*`). "Was it
  gated?" stays checkable via `gatedOnce`.
- **`/ai/confirm` execution is not logged** to the tool trace. So any **round-trip
  that must change DB state** (publish, GST, address, camp options, …) needs the
  scenario to set **`autoConfirm: true`** — the runner then confirms each turn's
  parked actions BEFORE the next turn, and the effect is verified via the DB readers
  (`productByName`, `merchantRow`, `campOptionsForCampNamed`, `activeProductCountByName`),
  not the trace. **Gate-test scenarios deliberately OMIT `autoConfirm`** to prove an
  unconfirmed action never takes effect.
- **Duplicate-create guard.** Before parking a create, `upsert_product` rejects a
  product whose name already exists *active* at the location (`BR_169`, surfaced to
  the model so it edits the existing row instead). This is why a run wants a clean
  DB — run `npm run eval:merchant:reset` first.

## Prereqs

- booking_system on `:4003` with `OPENROUTER_API_KEY` set server-side and the
  `ai.chat` permission seeded.
- A seeded merchant session. Defaults (overridable via env): merchant `977`,
  location `1708`, tokens `local-dev-access-token` / `local-dev-refresh-hash`.
- `DATABASE_URL` reachable (the DB is read via the Prisma client — no `psql`
  binary required).

Env knobs: `BOOKING_API_BASE`, `AI_EVAL_ACCESS_TOKEN`, `AI_EVAL_REFRESH_TOKEN`,
`AI_EVAL_MERCHANT_ID`, `AI_EVAL_LOCATION_ID`, `DATABASE_URL`. The `safety-grounding`
judge uses `OPENROUTER_API_KEY`; if absent the judge is skipped (pass) and only the
deterministic checks gate.

> Cases create throwaway `Eval *` draft products in the dev DB. A couple of
> `safety-guardrails` cases assume the seeded merchant already has a `Junior Ballet` product.

> **Rate limiting:** `/ai/chat` is rate-limited per user (`AI_RATE_MAX`, default
> 30/min). The suite drives many turns under ONE merchant identity, so start the
> dev server with a high limit for full runs, e.g. `AI_RATE_MAX=100000 npm run dev`
> — otherwise later scenarios get 429s. (Single-category runs usually stay under
> the default.)

## Model A/B (`compare-models.mjs`)

`npm run eval:merchant:ab` compares candidate models on the SAME suite to inform model
selection. For each model it boots a throwaway server (temp port, `AI_MODELS=<model>`,
rate limit off), runs the chosen scenarios, tears it down, and reports overall and
per-category pass rates with cost and latency. The running dev server is untouched.

```bash
AB_MODELS="model-a,model-b" npm run eval:merchant:ab -- capability-product-builds,conversation-memory,safety-guardrails
```

The OpenRouter account restricts routing to `openai`, `deepseek`, `anthropic`,
`perplexity`, `moonshotai`, `google-ai-studio` (no-log / DPA posture); a model served
only by another provider returns 404, and `compare-models.mjs` pre-probes and labels those rather
than scoring them zero. Widening the allowlist is a data-governance decision (more
processors see merchant conversation data).

Full model results, per-scenario pass/fail, and cost breakdown:
[`RESULTS.md`](./RESULTS.md). **Note:** the categories were renamed in this reorg —
`lifecycle`→`capability-product-builds`, `memory`→`conversation-memory`,
`discipline`→`safety-guardrails`, `coverage`→`capability-tool-coverage`,
`onboarding`→`capability-onboarding`, `grounding`/`robustness`/`security`→`safety-*`.
`RESULTS.md` predates the rename; re-run `eval:merchant:ab` to refresh.

## Adding a case

Append a scenario object to the relevant `scenarios/<dimension>/<file>.mjs` array
(or add a new file + an import in `all-scenarios.mjs`, following the `<folder>-<file>`
category convention). Import the check helpers from `../../engine.mjs`. A scenario is
`{ name, turns: string[], check(ctx) => string[] | Promise<string[]>, autoConfirm? }`;
`check` receives `{ trace, replies, allReplies, lastReply, pending, confirmResults, conversationId }`.

Use **`attempted`** for write tools (it counts the gated row) and `ok` only for
ungated reads; other common helpers: `any`, `touched`, `gatedOnce`, `realIdOnly`,
`replyLeaks`, and the DB readers `productByName`, `merchantProductIds`, `merchantRow`,
`productTypesLike`, `campOptionsForCampNamed`, `activeProductCountByName`. Set
`autoConfirm: true` on any scenario whose later turns or DB assertions depend on an
earlier write having landed (every write is gated); OMIT it for gate-tests that must
prove an unconfirmed action does nothing.
