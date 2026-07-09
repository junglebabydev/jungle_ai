# AI assistants — tests & evals

We ship **two** separate AI assistants. They are completely different products,
so they're tested completely separately. This folder holds both.

| | **Concierge** (`concierge/`) | **Merchant assistant** (`merchant/`) |
|---|---|---|
| Who talks to it | **Parents**, on the public site | **Merchants**, configuring their business |
| What it does | Searches for kids' activities and recommends them | Helps a merchant set up products, prices, pages, etc. |
| Can it change data? | **No** — read‑only, recommends only | **Yes** — it performs actions on the merchant's account |
| Biggest risks we test | Making up prices/classes; wandering off‑topic; child safety | Doing the wrong action; acting outside the merchant's permission; being tricked |

Both are reached through the same backend but have their own prompt, tools, and
guardrails. See `.claude/rules/02-architecture.md` → the "Agent" layer for how
they fit into the system.

---

## Two layers of checking, per assistant

For **each** assistant there are two things in play:

1. **Automated unit tests** (`*.test.ts`, run by `npm test`) — fast, deterministic
   checks on the *machinery*: does the tool dispatch correctly, are permissions
   re‑checked, is a sensitive action gated, are inputs validated. No live AI.
2. **Evals** (`<assistant>/eval/`, run by `npm run eval:*`) — real questions sent
   to the *live AI*, scored on the quality and honesty of the answer.

Think of layer 1 as "the wiring is correct" and layer 2 as "the assistant gives
good, safe answers".

---

## Concierge — the parent-facing search assistant

**Unit tests** (`concierge/*.test.ts`): results binding, counts, security, activity
details, conversation memory, the product‑discovery prompt.

**Evals** (`concierge/eval/`): **429 graded questions** across three areas —
`discovery` (search), `shared` (safety / honesty / security), `venue` (per‑place
chat). This is the most developed eval system in the repo.

- **[`concierge/eval/README.md`](./concierge/eval/README.md)** — how the eval runs,
  how it's scored, how to run a slice.
- **`concierge/eval/scenarios/`** — the questions **and** their pass/fail logic
  together (`.mjs`), grouped by `discovery` / `shared` / `venue`. Each file is
  self‑contained — read it top to bottom.
- **`concierge/eval/list-questions.mjs`** — prints all the questions in one list
  (`--json` for a dataset, e.g. fine‑tuning).
- **[`CONCIERGE_EVAL_QUESTIONS.md`](../../CONCIERGE_EVAL_QUESTIONS.md)** (repo
  root) — the same questions written for a **non‑technical** reader.

Run it:
```bash
npm run eval:concierge              # everything
npm run eval:concierge -- discovery # just search
npm run eval:concierge -- camps     # a topic (by folder or name substring)
```

## Merchant — the merchant-facing config assistant

**Unit tests** (`merchant/*.test.ts`): the tool‑calling loop, per‑tool handlers,
scope + ownership re‑checks (`dispatch`, `ownership`), the sensitive‑action confirm
gate, input/output guard, error mapping, chat DTOs.

**Evals** (`merchant/eval/`): **same shape as the concierge eval** — self‑contained
scenario files (questions + checks together), grouped by dimension: `capability`
(onboarding, product builds, tool coverage), `conversation` (memory), `safety`
(grounding, guardrails, robustness, security).

- **[`merchant/eval/README.md`](./merchant/eval/README.md)** — how to run and score it.
- **`merchant/eval/scenarios/`** — questions + pass/fail logic (`.mjs`).
- **`merchant/eval/list-questions.mjs`** — prints all the questions in one list.

Run it:
```bash
npm run eval:merchant
npm run eval:merchant -- safety              # a dimension (or name substring)
npm run eval:merchant:ab                     # compare two models side by side
```

---

## Why evals are separate from `npm test`

Evals need a **live app and a live AI model** and cost real money per run, so they
are **not** part of `npm test` (which must stay fast, free, and offline). They're
run deliberately — before shipping a change to an assistant, or when comparing
models. Their scorecards are saved as `RESULTS.md` next to each eval.
