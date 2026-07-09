# Concierge eval scenarios

This is where the eval lives. **Each file is self-contained** — it holds its
questions AND how they're graded, together. Open a file and read it top to bottom;
there's nothing else to chase.

Each scenario is one object: `{ name, turns, check }` — `turns` is what the parent
says, `check` decides pass/fail (deterministic invariants on the search results plus,
where useful, an LLM judge on the reply). Most files add a tiny builder so each case
fits on one line.

## Organised by surface (where the parent reaches the assistant)

| Folder | Surface | What it tests |
|---|---|---|
| `discovery/` | `POST /concierge/chat` — global search across all merchants | search, products, camps, pricing, regions, providers, filters, conversation, packages, explorer‑map |
| `venue/` | `POST /concierge/merchant-location/chat` — the per‑place card chat | knowledge, activity‑details, pricing, camps, conversation, location |
| `shared/` | **both** surfaces | cross‑cutting checks: security, jailbreak, child‑safety, grounding, bookings, quality, robustness |

`discovery/*` run in `mode: "discovery"`, `venue/*` in `mode: "venue"`, and `shared/*`
declare their own `mode` per scenario (so a shared file can mix both).

## Critical (must-pass) scenarios

Mark a scenario `critical: true` (or a whole file with `critical: true` next to its
`category`) for invariants that **must** hold to ship — no fabrication, no cross‑scope
leak, safety. The run prints a `CRITICAL: x/y` line and **fails the run** on any critical
miss, however high the overall rate. Today the safety/honesty `shared/` files plus a few
specific "no fabrication / no leak" cases are critical.

## Add a scenario

1. Open the right file (or add a new one) and add a case: `{ name, turns: ["..."],
   check }` — or use that file's builder (e.g. `q("name", "question", "rubric")`).
2. If you added a **new file**, register it in `../all-scenarios.mjs` (one import + one entry).
3. Run it: `npm run eval:concierge -- <your topic>`.

## See all the questions in one list

```bash
node tests/ai/concierge/eval/list-questions.mjs          # readable
node tests/ai/concierge/eval/list-questions.mjs --json    # JSON (e.g. for a dataset)
```

See `../README.md` for how the eval is scored and how to run slices.
