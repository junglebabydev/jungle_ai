# 02 — Services

**Status:** binding. **Read when adding or changing a service.**

Services live in `src/services/<domain>/` (kebab-case) and use up to three files:
`service.interface.ts`, `service.ts` (public), `service.internal.ts` (internal/raw).

**The interface is always present; the other two are included only when that layer exists** — a
service may legitimately have just two of the three. Real examples:
- `product/` — all three (public DTO surface + raw internal lookups).
- `product-category/`, `class/` — interface + `service.ts` only (public read surface, no raw engine).
- `merchant-chat-conversation/`, `concierge-conversation/` — interface + `service.internal.ts` only
  (raw conversation/turn/pending-action ops the assistants use; no DTO/public surface).

Rule of thumb: add `service.ts` when there's a public/DTO surface, `service.internal.ts` when
there's a raw data surface (used by ownership, dispatch, the resolver, or another service).

## The public/internal split
The split is *what they return and own*, not *what they import*.

| | Public (`service.ts`) | Internal (`service.internal.ts`) |
|---|---|---|
| Returns | `<X>ResponseDTO` (mapped) | raw Prisma model / extended type |
| Owns validation | Yes — business invariants | No — bare data ops |
| Owns DTO mapping | Yes (`mapXResponseDTO`) | Never |
| `tx?: Prisma.TransactionClient` | No | Yes — write methods take it last (`const db = tx ?? prisma`) |
| `find<X>` vs `get<X>` | `get<X>` throws `NotFoundError.<X>`; never returns null | `find<X>` returns `<X> \| null`; `get<X>` throws |
| Called by | routers, concierge tools, other public services | ownership, dispatch, the resolver, cross-service internal calls |

A public method MAY read `prisma` directly or go through its own internal — both exist in the
codebase. What it must NOT do is return a raw model.

## Registration
Every service is registered on `ServiceLocator` in `src/services/index.ts`. A service that is not on
the locator does not exist to the rest of the code. Cross-service calls go through the locator
(`ServiceLocator.<X>Service.public/internal`), never a direct file import. An internal method that
needs another domain calls its `.internal` slice (never `.public` — that would re-validate and
re-map).

## Closure discipline (KISS / DRY / minimal surface)
The service set is the **transitive closure** the two assistants actually reach — computed once,
kept tight. Adding a tool that reaches a NEW domain means: copy that domain's `service.*` folder,
register it on `ServiceLocator`, and use it. It does **not** mean importing `booking_system` or
adding a service nothing calls. Remove a service if the last tool that used it goes away.

## Cross-service workflows — the one orchestrator
When a single operation must coordinate writes across domains atomically, it goes in an
**orchestrator**, not a fat service. There is exactly one: `orchestration/schedule-session/`
(`ScheduleSessionOrchestrator`, registered on `ServiceLocator`). It composes services via the
locator's `.internal` slices inside a `prisma.$transaction`, passing `tx` to each. Don't add a
second orchestrator without surfacing the need — most changes are single-domain.

## Adding a service method
1. Declare it on the interface (DTO params/returns for public; raw for internal).
2. Implement it: public validates → does the work (own internal or `prisma`) → maps to a DTO;
   internal does the bare Prisma work, honoring `tx` on writes.
3. Wrap the body: `try { … } catch (e) { if (e instanceof ApplicationError) throw e; throw BadRequestError.<X>; }`
   (see `04-errors.md`).
4. Register on `ServiceLocator` if the service is new.

## Hard rules
- **Never** return a raw Prisma model from a public method — map to a DTO.
- **Never** return a DTO from an internal method.
- **Never** put business validation or DTO mapping in an internal method.
- **Never** import another service's implementation file — go through `ServiceLocator`.
- **Never** call `.public` from an internal method — use `.internal`.
- **Never** open a multi-domain `$transaction` inside a single service — promote to an orchestrator.
- **Never** register a service nothing calls, or leave a used service unregistered.
