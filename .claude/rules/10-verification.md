# 10 — Verification

**Status:** binding. **Read before declaring any change done.** Do NOT mark work complete before
this passes.

Run in order:

1. **Type-check the whole repo**
   ```
   npm run typecheck        # tsc --noEmit
   ```
   Must exit 0. `tsc` is necessary but **not sufficient** — a dependency behavior change, a `zod`
   JSON-Schema change, or a runtime wiring bug type-checks fine and still fails at boot.

2. **Build**
   ```
   npm run build            # tsc → dist/
   ```

3. **Boot smoke** — the check `tsc` can't do. Start the server (with a valid `.env`) and confirm the
   wiring end-to-end:
   ```
   node dist/index.js
   GET  /health                          → 200 {"status":"ok"}   (the only unauthenticated route)
   POST /api/v1/ai/chat        (no key)   → 401  (ATH_002, MissingToken "x-api-key")
   POST /api/v1/ai/chat        (bad key)  → 403  (ATH_005, Forbidden)
   POST /api/v1/concierge/chat (bad key)  → 403  (ATH_005)  — "public" is still behind the secret
   ```
   This exercises routing + the `x-api-key` guard + the exception serializer without touching the
   model, the DB, or the search engine.

4. **Live turn** (only when the change is model/tool/channel-facing, against **dev/local** infra with
   real `OPENROUTER_API_KEY` / `SEARCH_ENGINE_URL`):
   ```
   POST /api/v1/concierge/chat   (valid key + body)  → a reply + results, no leaked provider error
   POST /api/v1/ai/chat          (valid key + x-jungle-user-id + body)  → a reply; a write parks a
                                                                          confirm (pending[]), never auto-executes
   ```
   Confirm a leak attempt is refused (input screen) and a sensitive tool never runs without
   `/ai/confirm`. Do this only against dev/local infra.

## On tests
The `tests/` tree holds ported `.test.ts` specs (merchant + concierge) and `.mjs` LLM-eval harnesses,
but **there is no `test` npm script and no test runner in `devDependencies`** — they are not a wired
gate in this repo today. Verification is the four steps above. If you make the suite runnable
(add the runner + a script), say so explicitly; do not claim a green suite that can't be run.

## Hard rules
- **Never** declare done with `tsc` errors anywhere.
- **Never** rely on `tsc` alone after a dependency bump — re-run the boot smoke.
- **Never** claim "it works" without showing the actual command output.
- **Never** run a live model/search turn against shared production infra to verify — use dev/local.
- **Never** claim the test suite passes while it has no runner/script wired.
