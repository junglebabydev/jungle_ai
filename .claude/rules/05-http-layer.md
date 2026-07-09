# 05 — HTTP layer (routers, middleware, worker)

**Status:** binding. **Read when adding or changing a router, middleware, the worker, or an SSE turn.**

The HTTP surface is four routers mounted under `/api/v1` in `src/index.ts`, plus one background
worker. Everything except `GET /health` is behind `serviceAuthMiddleware`.

## Mounting (`src/index.ts`)
```
GET /health                                          → inline, unauthenticated (the ONLY such route)
/api/v1  serviceAuthMiddleware                        → conciergeRouter        (no forwarded identity — user-public)
/api/v1  serviceAuthMiddleware                        → merchantChatRouter     (identity per-route)
/api/v1  serviceAuthMiddleware  requireForwardedIdentity → whatsappRouter      (identity required)
/api/v1  serviceAuthMiddleware  requireForwardedIdentity → aiEvalRouter        (identity required)
app.use(exceptionMiddleware)                          → terminal error handler (MUST be last)
```
`startWhatsappWorker()` is called from `app.listen(...)` — **only** here, never a `buildApp()`.

## Middleware reference
- **`serviceAuthMiddleware`** — the only trust boundary. Reads `x-api-key`, compares to
  `JUNGLE_AI_API_KEY` (read at call time). Throws `AuthError.MissingToken("x-api-key")` /
  `AuthError.Forbidden`. First on every mounted router.
- **`forwardedIdentity`** — `requireForwardedIdentity` reads `x-jungle-user-id` into
  `req.auth = { userId, sessionId: 0 }` (throws `AuthError.AccessDenied` if absent);
  `attachForwardedIdentity` makes it optional. It is identity transport, **not** authorization —
  see `07-rbac-and-identity.md`.
- **`requireMerchantOwner`** — ownership guard (`req.auth.userId` must belong to `merchantId`;
  `SUPER_ADMIN` bypasses; an archived merchant is refused). Uses `ServiceLocator.*.internal`.
- **`requirePermission(code)`** — RBAC gate; resolves via `resolvePermissionsForRequest` and asserts
  the code. Argument is always `PERMISSIONS_MAP.<X>.code`, never a literal.
- **`validateBody(schema)`** — parses `req.body` with a `shared/dtos` Zod schema; a `ZodError` becomes
  `BadRequestError.ZodError` via `mapZodError`.
- **`rateLimit({ bucket, max, keyBy, windowMs })`** — thin adapter over `lib/rateLimiter`
  (`consumeRateLimit`); throws `GenericError.TooManyRequests` (429). Runs before any DB-touching guard
  so it rejects cheaply; an ip-keyed limiter is first, a user-keyed one runs right after identity
  (header-only, no DB). Key on a server value only (`user` = `req.auth.userId`, `ip`, or a derived
  key) — **never** client body.
- **`exceptionMiddleware`** — terminal; serializes `ApplicationError` → `{ code, message }`, else 500;
  emits 5xx to PostHog. **Must be the last `app.use(...)`.**

## Chain order
```
requireForwardedIdentity → rateLimit(keyBy:"user") → requireMerchantOwner → validateBody → requirePermission → handler
```
Skip the steps a route doesn't need, but never reorder. The invariants:
- **A user-keyed `rateLimit` comes AFTER identity** — `keyBy:"user"` reads `req.auth.userId`, which
  doesn't exist until `forwardedIdentity` ran (`merchantChatRouter` runs `requireForwardedIdentity`
  then `aiLimiter`; `whatsappRouter`'s per-route `wa-link` limiter runs after the global identity
  mount). Keying a user limiter before identity is forbidden. An **ip-keyed** limiter (the concierge)
  has no such dependency and goes **first**.
- **Identity before ownership/permission** — both read `req.auth`.
- **`validateBody` before `requirePermission`** — the resolver reads the parsed body.

`whatsappRouter` and `aiEvalRouter` get `requireForwardedIdentity` at the mount, so their routes
don't repeat it. `merchantChatRouter` and `conciergeRouter` are mounted WITHOUT it — concierge needs
no identity; the merchant routes call `requireForwardedIdentity` per-route. Match the existing router.

## Handler shape
Extract body/params → call **one** `ServiceLocator.<X>.public.<method>` (or the appropriate brain
turn-runner) → `res.status(HTTPS_STATUS_CODE.<X>).json(result)` → `catch (e) { next(e); }`. A JSDoc
block above each route states method, path, purpose, and the Authorization contract. Paths come from
`ALL_ROUTES` (`src/shared/routes.ts`); statuses from `HTTPS_STATUS_CODE` (`src/shared/enums.ts`).

## SSE streaming turns (the AI chat routes)
`/ai/chat`, `/concierge/chat`, and `/concierge/merchant-location/chat` stream when the client sends
`Accept: text/event-stream`. The pattern (mirror it exactly):
- Set the SSE headers, `res.flushHeaders?.()`, define `send(obj) = res.write("data: " + JSON.stringify(obj) + "\n\n")`.
- Pass `onToken`/`onReset` callbacks into the turn-runner (`onReset` = the client clears everything
  streamed so far — a leaked preamble or a mid-stream refusal). End with a `done` event carrying the
  final `reply` + `pending`/`results`, then `res.end()`.
- **On error mid-stream** (status already sent): never leak — `send` a graceful `token` + a `done`
  with an empty reply, then `res.end()`. On error before the handle exists, `next(e)`.
- Non-streaming clients get the same result as JSON. Keep the two paths returning the same shape.

## The worker (`src/worker/whatsappWorker.ts`)
Drains the shared Postgres inbound queue **serially** (`claimNext` uses `FOR UPDATE SKIP LOCKED`; one
job at a time so a double-tapped Confirm can't run `executeConfirmation` concurrently). It calls
`processInboundJob` from `ai/channels/whatsapp/merchant.ts`. Owns retry / dead-letter / visibility
reclaim. `wakeWhatsappWorker()` wakes it on enqueue; polling is the fallback. A no-op (with a warning)
when WhatsApp env isn't configured. Started only from `index.ts`.

## Hard rules
- **Never** mount a route outside `serviceAuthMiddleware` (except `GET /health`).
- **Never** put a guard after the handler, or `exceptionMiddleware` anywhere but last.
- **Never** call `prisma` or a service file directly from a handler — go through `ServiceLocator`.
- **Never** call `requirePermission`/`requireMerchantOwner` on a route that isn't behind identity.
- **Never** `res.send`/`res.status(500)` on failure, or leak a provider error into an SSE stream —
  always `next(e)` (pre-stream) or a graceful `token`+`done` (mid-stream). See `04-errors.md`.
- **Never** write an inline path or numeric status — use `ALL_ROUTES` / `HTTPS_STATUS_CODE`.
- **Never** start the worker from `buildApp()` / a test entry — only `index.ts`.
