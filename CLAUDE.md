# Project rules for Claude Code — `jungle_ai`

This file is the entry point for the Jungle **AI service**. Read it at the start of
**every** session and follow it strictly. The full ruleset lives under `.claude/rules/`.
Each rules file is binding — not a suggestion.

`jungle_ai` is the **internal-only AI microservice**: two assistants ("brains") and the
channels they're reached through. The **merchant** assistant helps a merchant configure
their store (tool-calling agent, RBAC + a confirm gate on every write). The **concierge**
assistant is the parent-facing catalogue search chat (read-only, no RBAC, no writes). It runs
its own Prisma client against a shared Postgres and calls `search_engine` for concierge search.
See `README.md` for port, health, and how to run it.

---

## Non-negotiables (in order)

### 1. Internal-only — the whole service sits behind one service secret
`jungle_ai` is **never** exposed to the public network. Only `booking_system` reaches it, over
HTTP with the `x-api-key` shared secret (`JUNGLE_AI_API_KEY`). **Every route is mounted behind
`serviceAuthMiddleware`; the ONLY network-unauthenticated route is `GET /health`.** A concierge
endpoint labelled "public" is public in the *user* sense (no signed-in user, no RBAC) — it is
still behind the `x-api-key` secret. Never add a route that bypasses `serviceAuthMiddleware`.
See `.claude/rules/00-architecture.md` and `05-http-layer.md`.

### 2. Forwarded identity, never payload trust
`booking_system` runs the user auth and forwards the *already-verified* caller id in
`x-jungle-user-id`; `forwardedIdentity` reads it into `req.auth`. Scope for a channel/assistant is
derived from a **verified binding** (the conversation scope, the `WhatsappLink`), never from
message content. The merchant assistant **still re-checks RBAC + ownership in-process**
(`dispatch` → `resolvePermissions`, `ownership`, the `gate`) — defense in depth. See
`.claude/rules/07-rbac-and-identity.md`.

### 3. Follow the layering and import direction
Dependencies flow downward: `index.ts` → routers → middleware → assistants/channels → services
(`ServiceLocator`) → `auth` → `config/prisma`. Leaf layers (`shared`, `errors`, `utils`, `lib`,
`config`) have no upward imports. Cross-service access goes through `ServiceLocator`
(`src/services/index.ts`) — never import a service implementation file directly; never call
`prisma` from a router, middleware, or assistant tool (tools depend only on `ServiceLocator` — DIP,
so they stay unit-testable with a mocked locator). See `.claude/rules/00-architecture.md`.

### 4. Two brains, one naming rule
A symbol that belongs to ONE brain is qualified by that brain (`runMerchantTurn` /
`runConciergeTurn`, `MERCHANT_TOOLS` / `CONCIERGE_TOOLS`, `merchantSystemPrompt`); brain-agnostic
plumbing is unqualified (`guard`, `evalLog`). Never the bare word "agent" for a type or file that
belongs to one brain. The two brains never import each other — anything shared lives in
`src/ai/shared/`. See `.claude/rules/06-ai-assistants.md` and `08-naming-conventions.md`.

### 5. Reuse conventions; keep the closure minimal; don't clutter (SOLID / KISS / DRY)
Match the established patterns (3-file services, DTO + `mapXResponseDTO`, the error catalog, no
inline literals). Only the services / lib / DTOs the assistants actually need were copied — the
closure is intentionally small. Adding a tool that reaches a NEW service means registering that
service (and copying its domain), not importing `booking_system`. No orphan files, speculative
abstractions, dead code, or unused deps. The result must read as if one careful engineer wrote it.
See `.claude/rules/02-services.md` and `09-code-quality.md`.

### 6. Shared DB it does NOT own; pin dependencies
This service owns a Prisma **client** against a shared Postgres — it **never migrates** and never
edits `prisma/schema.prisma` to add behavior (the database is authoritative and owned elsewhere).
**Pin dependencies to exact versions** and verify any bump with the boot smoke — a runtime change
can pass `tsc`. See `.claude/rules/01-dependencies.md`.

### 7. Never throw raw errors or leak the model/provider to the caller
Every error crossing a layer is a typed `ApplicationError` from `src/errors/domains/*`, serialized
by `exceptionMiddleware` to `{ code, message }`. Never `throw new Error(...)`. **Never let an LLM
or provider error reach the caller** — the loop redacts the reply; the router logs it and replies
gracefully. See `.claude/rules/04-errors.md`.

### 8. Verify at the end
Every change ends with: `npm run typecheck` (0 errors) → `npm run build` → a **boot smoke**
(`/health` + the `x-api-key` guard). See `.claude/rules/10-verification.md`.

---

## Index

| # | File | When to read |
|---|------|--------------|
| 00 | `00-architecture.md` | Once per session — the layer map, import direction, the boundary |
| 01 | `01-dependencies.md` | Before adding/upgrading a dependency — pin versions, shared DB not owned |
| 02 | `02-services.md` | Adding/changing a service (3-file pattern, ServiceLocator, closure) |
| 03 | `03-dtos-and-validation.md` | Adding/changing a DTO, Zod schema, or mapper |
| 04 | `04-errors.md` | Throwing or catching anywhere; relaying a tool failure |
| 05 | `05-http-layer.md` | Adding/changing a router, middleware, the worker, or an SSE turn |
| 06 | `06-ai-assistants.md` | **The AI core** — the two brains, tools, loop, dispatch, gate, guard, channels |
| 07 | `07-rbac-and-identity.md` | Anything touching auth, identity, scope, or permissions |
| 08 | `08-naming-conventions.md` | Any new file, folder, or symbol |
| 09 | `09-code-quality.md` | Always — read once per session (the "never do this" list) |
| 10 | `10-verification.md` | Before declaring any change done |
| 11 | `11-comments-and-readability.md` | Writing any code — names carry *what*, comments carry *why* |

---

## Quick decision map

- **New endpoint** → 00, 05, 07, 03 (if it takes a body), 04.
- **New service or service method** → 00, 02, 03, 04.
- **New AI tool (merchant or concierge)** → 06 (tool contract, registry, sensitivity/gate), 07
  (RBAC codes + ownership for merchant tools), 02 (if it reaches a new service), 04.
- **Change the agent loop / prompt / guard / channel** → 06, then 04 (never leak), 11 (comments).
- **Auth / identity / scope change** → 07, 05 (middleware chain), 00.
- **New shared value between services** (a secret, a base URL) → 08 (same name on both sides), 01.
- **Bug fix** → 09, plus the file for the layer of the bug.

---

## What this service does NOT have (don't add without asking)
No Firebase / user login (the user auth runs in `booking_system`; this service trusts the forwarded
id behind `x-api-key`). No schema ownership (it reads a shared DB, never migrates). No public
network exposure (only `/health` is unauthenticated; everything else needs the service secret). The
**concierge** brain has no RBAC, no writes, and no confirm gate — it is read-only over public
catalogue search. If a change seems to need one of these, stop and surface it — it's a design
decision, not a default.
