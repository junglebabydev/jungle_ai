# 00 — Architecture

**Status:** binding. **Read once per session.**

`jungle_ai` is an internal HTTP service that fronts two AI assistants. Dependencies flow strictly
**downward**; same-layer imports are fine, up-layer imports are forbidden.

```
                         HTTP request (only from booking_system, over x-api-key)
                              │
   src/index.ts   (express, cors, json; mounts routers behind serviceAuthMiddleware; starts the worker)
                              ▼
   src/middleware/    serviceAuthMiddleware (x-api-key gate) · forwardedIdentity (x-jungle-user-id → req.auth)
                      requireMerchantOwner · requirePermission · validateBody · rateLimit · exceptionMiddleware
                              ▼
   src/routers/       conciergeRouter · merchantChatRouter · whatsappRouter · aiEvalRouter  (thin handlers)
                              ▼
   src/ai/            assistants/merchant/  (runMerchantTurn: loop → dispatch → gate → tools)
                      assistants/concierge/ (runConciergeTurn: loop → read-only tools)
                      channels/whatsapp/    (merchant.ts: transport in front of the merchant brain)
                      shared/               (guard, evalLog — used by BOTH brains)
                              ▼
   src/worker/        whatsappWorker (drains the shared inbound queue; started ONLY from index.ts)
                              ▼
   src/services/      (via ServiceLocator only) ~22 domain services + orchestration/schedule-session
                              ▼
   src/auth/          role-resolver · permission-resolver (resolvePermissions — the RBAC core)
                              ▼
   src/config/prisma.ts   (own client, shared Postgres — NOT owned; never migrated)

   Leaf layers (no upward imports): src/shared/ · src/errors/ · src/utils/ · src/lib/ · src/config/
```

## The booking_system ↔ jungle_ai boundary (the core concept)
`jungle_ai` is a **peer service**, reached the same way `booking_system` reaches `search_engine`.

```
   ┌───────────────────┐   x-api-key: JUNGLE_AI_API_KEY      ┌──────────────────────┐
   │  booking_system   │   x-jungle-user-id: <verified id>   │      jungle_ai        │
   │  (the public app) │ ──────────────────────────────────▶ │  (internal-only)      │
   │  Firebase auth +  │   HTTP via aiClient reverse-proxy   │  serviceAuthMiddleware│
   │  ownership + RBAC │ ◀────────────────────────────────── │  + forwardedIdentity  │
   └───────────────────┘        { code, message } / SSE      └───────────┬──────────┘
                                                                          │ x-api-key
                                                                          ▼
                                                              ┌──────────────────────┐
                                                              │    search_engine      │
                                                              │  (concierge search)   │
                                                              └──────────────────────┘
```

- `booking_system` runs the user auth (Firebase + ownership + `requirePermission`) and forwards the
  **verified** caller id in `x-jungle-user-id`. `jungle_ai` trusts that header *only because* it
  sits behind the `x-api-key` secret — nothing else can reach it.
- `jungle_ai` calls `search_engine` for concierge search via `src/lib/searchClient.ts` (its own
  `x-api-key`, `SEARCH_ENGINE_URL` + `SEARCH_ENGINE_API_KEY`).
- The externally-facing WhatsApp webhook stays on `booking_system` (Meta can't reach this service);
  `booking_system` verifies the HMAC and enqueues to the shared job queue. This service's
  `whatsappWorker` drains that queue. `jungle_ai` serves only WhatsApp **link management** + the
  worker, never the public webhook.

## The two brains
Both live under `src/ai/` and compose services via `ServiceLocator`; they never import each other.
- **`assistants/merchant/`** — the config assistant. `loop.ts` exports `runMerchantTurn`; a tool
  registry + handlers under `tools/`; `dispatch.ts` (per-tool RBAC via `resolvePermissions` +
  ownership re-check); `gate.ts` (server-authoritative confirm for sensitive/write tools);
  `ownership.ts`; `merchantSystemPrompt.ts`; `manifest.ts`; `errors.ts`.
- **`assistants/concierge/`** — the parent-facing search assistant. `loop.ts` exports
  `runConciergeTurn`; thin entry points `productDiscovery.ts` (`runProductDiscovery`) and
  `merchantLocationChat.ts` (`runMerchantLocationChat`) over the shared loop; read-only `tools/`
  (`search_activities` → `searchClient`, `get_activity_details`). **No RBAC, no writes, no gate.**
- **`shared/`** — `guard.ts` (input screen / output redaction / spotlighting) and `evalLog.ts`
  (PostHog telemetry), used by BOTH brains. Brain-agnostic only.
- **`channels/whatsapp/merchant.ts`** — one transport file per (channel × brain). A peer to
  `merchantChatRouter`, NOT a service; reached only from `whatsappWorker`.

## ServiceLocator
`src/services/index.ts` is the **only** import surface for services (and the one orchestrator). It
exposes each domain as `{ public?, internal? }`:
```ts
ServiceLocator.ProductService.public.getProductById(...)        // routers, public services, concierge tools
ServiceLocator.ProductService.internal.findProductById(...)     // ownership, dispatch, cross-service raw lookups
ServiceLocator.ScheduleSessionOrchestrator.public.<method>(...) // the single cross-service workflow
```

## Import rules
- **Routers** may import `ServiceLocator`, middleware, the brains' turn-runners (`runMerchantTurn`,
  `runProductDiscovery`, `runMerchantLocationChat`, `executeConfirmation`), `shared/`, `errors/`,
  `lib/`. **Must not** import a service file directly, call `prisma`, or import another router.
- **Middleware** may import `ServiceLocator`, `auth/`, `shared/`, `errors/`, `lib/`. **Must not**
  call `prisma` or import a service file directly.
- **Assistants / channels / shared** may import `ServiceLocator`, `lib/`, `shared/`, `errors/`,
  `utils/`; the merchant brain also imports `auth/` (`resolvePermissions`). **Must not** import
  routers, middleware, a service file directly, or the other brain. Tool handlers depend ONLY on
  `ServiceLocator` (+ scope) — DIP.
- **Worker** may import its channel (`ai/channels/whatsapp/`), `ServiceLocator` (`.internal` queue
  ops), `lib/`, `errors/`. Started **only** from `index.ts`, never a `buildApp()` tests would load.
- **Services (public)** return DTOs, own validation + mapping; **services (internal)** return raw
  Prisma/extended types and may take `tx?: Prisma.TransactionClient`. See `02-services.md`.
- **`shared/`, `errors/`, `utils/`, `lib/`, `config/`** are leaves — no upward imports.

## Hard rules
- **Never** import a service implementation file directly — always `ServiceLocator`.
- **Never** call `prisma` from a router, middleware, assistant, channel, or tool handler.
- **Never** let the two brains import each other — shared code goes in `src/ai/shared/`.
- **Never** mount a route outside `serviceAuthMiddleware` (except `GET /health`).
- **Never** start the worker from anywhere but `index.ts`.
- **Never** create a new top-level `src/` folder without updating this map.
