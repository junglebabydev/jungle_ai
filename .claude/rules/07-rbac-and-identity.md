# 07 — RBAC and identity

**Status:** binding. **Read whenever you touch authentication, identity, scope, or permissions.**

This service does not authenticate users — `booking_system` does. `jungle_ai`'s job is to (1) trust
the forwarded identity because it sits behind the service secret, and (2) still enforce RBAC +
ownership in-process for the merchant brain, as defense in depth.

## The identity chain
```
booking_system: Firebase authMiddleware + ownership + requirePermission
      │  forwards the VERIFIED user id
      ▼  x-api-key: JUNGLE_AI_API_KEY   +   x-jungle-user-id: <id>
serviceAuthMiddleware  →  the x-api-key gate makes x-jungle-user-id trustworthy (only booking can reach us)
forwardedIdentity      →  req.auth = { userId, sessionId: 0 }
```
- `requireForwardedIdentity` requires the header (throws `AuthError.AccessDenied` if absent);
  `attachForwardedIdentity` makes it optional. This is identity **transport**, not the authorization
  decision.
- The concierge routes carry no forwarded identity — they are user-anonymous (no signed-in user), but
  still behind `x-api-key`. "Public" here means *no user / no RBAC*, not *reachable without the secret*.

## Scope comes from the verified binding, NEVER the payload
The scope a brain runs against is derived from a **verified source**, never from message content or
a client-supplied field:
- Web merchant chat: the conversation's pinned `merchantId`/`locationId`, checked against the
  forwarded `userId` (the router rejects a conversation that isn't this user's + scope).
- WhatsApp: the `WhatsappLink` bound to the sender's phone (`channels/whatsapp/merchant.ts`) — the
  message text is never the source of scope.
- Concierge venue chat: the `merchantId`/`locationId` the FE sent when opening the card, pinned into
  every search server-side; the model cannot widen out.

## `resolvePermissions` — the shared RBAC core (`src/auth/`)
`resolvePermissions({ userId, merchantId?, locationId? })` returns the `Set<string>` of permission
codes = platform role (always) + merchant role (if merchantId) + location role (if locationId),
inferring `merchantId` from `locationId` when needed. Roles come from `RoleResolver`
(`getPlatformRole` / `getMerchantRole` / `getLocationRole`, each via the relevant service's
`.internal` slice); codes come from `RolePermissionService.internal`.

The **same** function backs both entry points, so they resolve identically:
- `resolvePermissionsForRequest(req)` — the `requirePermission` middleware adapter (reads params
  then body).
- `resolvePermissions(scope)` — called directly by the merchant loop (`dispatch`) and `gate`.

That identity is the point: the merchant agent's in-process tool checks get the exact RBAC backstop
the HTTP middleware chain provides.

## Defense in depth (merchant brain)
Authorization holds at three independent layers, so a break in one doesn't open the gate:
1. **booking_system** ran ownership + `requirePermission` before forwarding (the outer gate).
2. **In-process RBAC** — `dispatch.ts` re-validates the tool's Zod input, re-checks ownership
   (`ownership.assertResourceOwnership` — a model-supplied `productId`/`packageTemplateId` MUST
   resolve to the pinned scope; ids are coerced so a string id can't skip the check), and enforces
   the tool's `requiredPermissions` against the resolved set.
3. **The confirm gate** — no sensitive/write tool runs without an explicit `/ai/confirm` (or WhatsApp
   button) click; `executeConfirmation` re-derives scope and re-checks RBAC/ownership, single-use.

For location endpoints and where the same permission exists, use `PERMISSIONS_MAP.<X>.code` — never a
raw string. New permissions are a `booking_system`-owned concern; this service consumes the codes it
was given (`PERMISSIONS_MAP` in `src/shared/constants.ts`).

## Hard rules
- **Never** trust `x-jungle-user-id` outside the `serviceAuthMiddleware` boundary, or read a caller
  id from anywhere but `req.auth` (populated by `forwardedIdentity`).
- **Never** derive scope, ownership, or a permission decision from message content or a client-
  supplied body field — only from the verified conversation/binding.
- **Never** skip the merchant brain's in-process RBAC/ownership re-check because "booking already
  checked" — the layers are independent by design.
- **Never** pass a raw string to `requirePermission` — always `PERMISSIONS_MAP.<X>.code`.
- **Never** resolve roles anywhere but through `resolvePermissions` / `RoleResolver`.
- **Never** add a role or a new permission here — surface it; the catalog is owned upstream.
