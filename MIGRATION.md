# AI extraction: booking_system → jungle_ai

Moving **all** AI code out of `booking_system` into this standalone service,
mirroring the `search_engine` pattern (own Express app, own Prisma against the
shared DB for now, `x-api-key` service auth, booking calls it over HTTP).

## Target boundary

```
browser / WhatsApp
      │
      ▼
booking_system  ──HTTP (aiClient, x-api-key)──▶  jungle_ai ──HTTP──▶ search_engine
      │                                              │
      └────────────── shared Postgres ───────────────┘   (isolated DBs later)
```

- Booking keeps **thin proxy routers** (`/concierge/*`, `/ai/chat`, `/ai/confirm`,
  the WhatsApp webhook) that forward to `jungle_ai` via an `aiClient` — same shape
  as `searchClient`. No AI logic stays in booking.
- `jungle_ai` owns the assistants and reaches the domain through its **own** copy of
  the services layer (ServiceLocator) against the shared DB — the merchant assistant
  is a full write-path, so those services come across, not just read helpers.

## What moves (inventory)

**`src/ai/` (34 files):** `assistants/merchant/*` (+ `tools/*`), `assistants/concierge/*`
(+ `tools/*`), `channels/whatsapp/merchant.ts`, `shared/{guard,evalLog}.ts`, `README.md`.

**Wiring (6 files) → become booking proxies / move here:** `routers/conciergeRouter.ts`,
`routers/merchantChatRouter.ts`, `routers/whatsappWebhookRouter.ts`,
`worker/whatsappWorker.ts`, `shared/dtos/WhatsappDTOs.ts`, `lib/posthog.ts` usage.

**Transitive deps the AI pulls in:**
- `lib/`: `openrouter`, `posthog`, `rateLimiter`, `searchClient`, `whatsapp`
- `shared/`: `constants`, `trails`, and DTOs — Birthday/Camp/CampOption/Class/Concierge/
  DropIn/Location/LocationOperatingHrs/Merchant/PackageTemplate/Pricing/Product/
  Schedule/Search/Session/Whatsapp
- `errors/` (ApplicationError + domains), `utils/` (3), `auth/` (`resolvePermissions`)
- **services (17 via ServiceLocator):** Birthday/Camp/CampOption/Class/DropIn Details,
  ConciergeConversation, MerchantChatConversation, Location, Merchant, PackageTemplate,
  Pricing, ProductCategory, Product, Schedule, Session, WhatsappLink,
  + `ScheduleSessionOrchestrator`.

## Phases

- [x] **Phase 0 — Bootstrap.** Repo scaffold mirroring `search_engine`: package.json,
  tsconfig, Dockerfile (:4006), nodemon, prisma schema copy, `config/prisma`, `/health`.
- [x] **Phase 1 — Shared foundation.** Copied `errors/`, `shared/` (DTOs/enums/constants/
  routes/types/trails), `utils/`, and lib subset (`openrouter`, `posthog`, `rateLimiter`,
  `searchClient`, `whatsapp`). Pruned firebase/upload leftovers (FirebaseDTOs, authValidations,
  Multer field, `window.atob`→Buffer). Added `date-fns`. `tsc --noEmit` green. Still TODO:
  `middleware/{serviceAuthMiddleware,exceptionMiddleware}` (exception needs a posthog tweak).
- [x] **Phase 2 — Services + auth.** Computed the transitive closure (BFS over
  `ServiceLocator.*` refs) = **21 of 51 domains** + `schedule-session` orchestrator; copied
  exactly those + `auth/`; wrote a trimmed `ServiceLocator` (`services/index.ts`). Closure
  needs only `lib/{searchClient,whatsapp}` + `date-fns` + `config/prisma` — **zero**
  firebase/stripe/resend/storage. `tsc` green.
- [x] **Phase 3 — AI code.** Copied `src/ai/` verbatim (32 files) — dir layout matches
  booking so relative imports resolved unchanged; only extra needed was `lib/cache`. No new
  npm deps (openrouter/whatsapp use fetch). `tsc --noEmit` green. All 17 ServiceLocator keys
  the AI uses are registered.
- [x] **Phase 4 — Routers + worker + wiring.** Moved concierge (verbatim), whatsapp
  webhook (verbatim), merchant chat (adapted), + whatsapp worker; added the
  `whatsapp-inbound-job` service (webhook/worker dep). New middleware: `serviceAuthMiddleware`
  (x-api-key = `JUNGLE_AI_API_KEY`) + `forwardedIdentity` (reads booking's `x-jungle-user-id`).
  Merchant chat drops `requireMerchantOwner`/`requirePermission` (booking's proxy owns those;
  assistant re-checks in-process). `index.ts` mounts webhook pre-json (public/HMAC), concierge +
  merchant behind serviceAuth under `/api/v1`, starts the worker. `tsc --noEmit` green.
- [ ] **Phase 5 — Rewire booking.** Add `aiClient` in booking; replace the AI routers
  with thin proxies; delete `src/ai/`, the AI worker, and now-unused AI-only deps from
  booking. Booking typecheck + suite green.
- [ ] **Phase 6 — Deploy.** Dev `redeploy-ai` alias (pull `dev`, build, run on
  `booking-system-dev_default`, :4006), env, docker network. Verify end-to-end.

## Notes / risks

- **Express version:** scaffold uses express 4 (like `search_engine`); the AI routers
  came from booking (express 5). Route paths are simple, but re-verify param syntax when
  routers land in Phase 4.
- **DB writes:** the merchant assistant writes across 17 services against the *shared* DB
  during the transition — same rows booking writes. Fine until DBs are split; call it out
  when the isolated-DB work starts.
- **Evals:** `tests/ai/**` eval harnesses in booking (`npm run eval:*`) also depend on this
  code — decide whether they move here or keep hitting booking's proxy.
- **Seed/permissions:** RBAC (`resolvePermissions`) reads Role/Permission tables — unchanged
  while the DB is shared.
