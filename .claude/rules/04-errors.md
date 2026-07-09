# 04 — Errors

**Status:** binding. **Read when throwing or catching anywhere, or relaying a tool failure.**

Every error that crosses a layer is a typed `ApplicationError` (`src/errors/ApplicationError.ts` —
`{ status, message, statusCode }`). `exceptionMiddleware` serializes it to `{ code, message }` with
the right HTTP status; a non-`ApplicationError` becomes a generic 500 (`GenericError.InternalServerError`).

## Catalogs (`src/errors/domains/`)
| Catalog | Prefix | HTTP | Use |
|---|---|---|---|
| `AuthError` | `ATH_` | 401/403 (+423 `SubscriptionSuspended`) | the `x-api-key` gate, forwarded-identity, RBAC (`MissingToken`, `Forbidden`, `AccessDenied`) |
| `BadRequestError` | `BR_` | 400 | invalid input / failed action / `ZodError`, `OrderByKeyNotAllowed`, `WhatsappSend`, per-resource `Fetch/Create/Update` |
| `NotFoundError` | `NF_` | 404 | a `get<X>ById` lookup missed (`Product`, `Merchant`, `ConciergeConversation`, `WhatsappLink`, …) |
| `GenericError` | `GE_` | 500/503/429 | `InternalServerError` (the middleware's catch-all), `TooManyRequests` (429), `SearchUnavailable` (503) |

Entries are either static instances (fixed message) or factories `(arg) => new ApplicationError(...)`
for runtime context. Codes are a **stable contract** — frontend, tests, and the AI tool-failure
relay match on them. Add a new code as the next sequential `<PREFIX>_<NNN>`; never reuse/renumber.

## The wrapping idiom
Every public service / internal write / orchestrator method ends with:
```ts
try {
  // work
} catch (e) {
  if (e instanceof ApplicationError) throw e; // preserve typed errors (keeps a 404 a 404)
  throw BadRequestError.<Action>;             // wrap anything else in an action-named error
}
```
Routers propagate via `catch (e) { next(e); }` — the exception middleware owns the response.

## Never leak the model or provider to the caller
The LLM path has an extra rule: a provider/LLM error must **never** reach the caller as a raw error.
- In the **loop** (`runMerchantTurn` / `runConciergeTurn`): a model call that throws is recorded in
  telemetry and rethrown; the reply is scrubbed by `redactReply` (guard) before it is returned or
  persisted, so an internal code / token / tool-name / prompt fragment never ships.
- In the **router**: a non-`ApplicationError` from a turn is caught, logged server-side, and answered
  with a graceful, generic reply (JSON, or an SSE `token` + `done`) — never `next(e)` once a
  conversation handle exists. A typed `ApplicationError` (validation, bad conversation id) still
  keeps its status via `next(e)`.

## Relaying a tool failure to the model (merchant brain)
Tools do not throw to the model. `ai/assistants/merchant/errors.ts` maps a thrown `ApplicationError`
into a structured `ToolResult` (`toToolFailure` → `{ ok:false, code, message, missingRequired? }`;
`toolOk(data)` for success). The model interprets `code`/`message` (e.g. asks for a missing field)
but is prompted never to surface them; the guard strips them if it tries. An *unexpected* (non-
`ApplicationError`) error rethrows to the loop — it is not a tool failure.

## Hard rules
- **Never** `throw new Error(...)` — always a typed `ApplicationError` (except the loop's internal
  "no response" sentinels, which the router/redaction layer never surfaces raw).
- **Never** construct `new ApplicationError(...)` outside `src/errors/domains/`.
- **Never** `res.status(500).send(...)` — throw a typed error; the middleware serializes it.
- **Never** drop the `if (e instanceof ApplicationError) throw e;` line (it prevents downgrading).
- **Never** swallow an error (`catch { return null }`) — rethrow (typed or wrapped), except the
  explicitly best-effort paths (telemetry, history-write after a confirmed change, a send after the
  turn committed) which log and continue by design.
- **Never** let an LLM/provider error, an internal code, or a tool name reach the caller.
- **Never** reuse or renumber an existing error code.
