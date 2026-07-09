# 11 — Comments & readability

**Status:** binding. **Read when writing or changing any code.**

The guiding principle: **names carry the *what*; comments carry the *why*.** Names, routes, and env
variables must read like plain language a non-technical teammate can follow. This merges the
file/symbol conventions of `08-naming-conventions.md` with the single principle they serve.

## Naming (make the code self-explanatory)
- Full, descriptive, plain-language names. A reader infers intent from the name alone:
  `runMerchantTurn`, `assertResourceOwnership`, `resolvePermissions`, `screenInput`,
  `spotlightToolResult` — not `runMT`, `chkOwn`, `resPerm`, `scrn`.
- No cryptic abbreviations or single letters (except tiny local loop indices). Prefer `merchantId`
  over `mId`, `conversationId` over `convId`. Booleans read as questions (`isWhatsappConfigured`,
  `scoped`, `sensitive`); functions read as actions (`buildVenueContext`, `dispatchTool`).
- If you need a comment to explain *what* a name is, first try to **rename it** so the comment isn't
  needed.

## Routes & shared values read like the action
- A route reads like what it does: `POST /ai/chat`, `POST /ai/confirm`, `POST /concierge/chat`,
  `POST /whatsapp/link`. Every path comes from `ALL_ROUTES`; never an inline string.
- A value that wires two services together has the SAME name on both sides (`JUNGLE_AI_API_KEY`,
  `SEARCH_ENGINE_URL`, `x-jungle-user-id`) so the "wire" is obvious — see `08`.
- Group env variables by subsystem with a consistent prefix (`OPENROUTER_*`, `CONCIERGE_*`,
  `WHATSAPP_*`, `SEARCH_ENGINE_*`).

## Comments (explain *why*, precisely — never *what*)
- **Every function gets a short doc comment on top** stating **why it exists** — the reason or the
  problem it solves — in 1–3 precise lines of plain language. Not a restatement of the code. The AI
  layer especially: a security guard, a token-budget cap, an anti-injection frame, a hold-back window
  each need their *why* (they look arbitrary otherwise). The existing `guard.ts` / `loop.ts` comments
  are the model to match.
- **Inline comments only where the code can't explain itself:** a non-obvious *why* — a workaround, a
  tuned constant, an ordering constraint, an anti-injection guard, an intentional edge case, a
  best-effort-by-design catch. If the line is self-evident, **no comment.**

## Do NOT clutter
- No comment that just repeats the code. No commented-out / dead code — delete it (git remembers).
- No decorative banners or filler. (The light `// ── section ──` dividers in `guard.ts` are fine —
  leave them; don't add new ones.)
- No dangling `TODO`/`FIXME` without an owner or issue reference.

## Explain the local *why* — not where the code came from
Comments describe **this service on its own terms**. Naming another service **is required** where it
describes the real, load-bearing boundary this service actually crosses — `booking_system` forwards
the identity, `search_engine` serves concierge search, `JUNGLE_AI_API_KEY` is the shared secret.
Those are facts of the architecture (`00`), not provenance.

What is forbidden is **provenance archaeology** — framing code by where it was copied from, or
pointing at plans/hosts/docs that don't live in this repo: "ported from the MCP host", "plan §7 /
§12.2", "mirrors the MCP's registry", "see docs/concierge/search-first-proposal.md". These say
nothing about the local *why* and rot the moment the referenced thing moves. Rewrite them to explain
what the code does and why it must. (Some of these exist in the current code from the extraction —
when you touch such a comment, replace it with a local *why*.)

## Hard rules
- **Never** ship a function without a concise top-of-function *why* comment.
- **Never** write a comment that restates the code — rename or delete instead.
- **Never** leave commented-out code or decorative filler.
- **Never** abbreviate a name where a full word reads clearer.
- **Never** frame code by its provenance (a plan, another host, a doc path) — explain the local
  *why*. Naming a peer service is allowed only when it *is* the boundary being described.
