# 09 — Code quality & forbidden patterns

**Status:** binding. **Read once per session.** The consolidated "never do this" list. The owner
holds a strict bar: SOLID, KISS, DRY, clear layering, DI, typed errors, no dead code.

## Quality bar
- **One intentional design.** Code must read as if one careful engineer wrote it — match the
  surrounding style, layering, and naming. No ad-hoc or "vibe-coded" additions.
- **SOLID, applied concretely here.** SRP: a tool is a definition + a pure handler; the loop
  orchestrates, the gate confirms, the guard scrubs — one job each. **DIP: tool handlers depend only
  on `ServiceLocator` + scope**, never on transport or `prisma`, so they're unit-testable with a
  mocked locator. Open/closed: add a tool by adding a file + a registry line, not by editing the loop.
- **KISS / DRY.** The engine lives in one place (`runConciergeTurn`; the shared `guard`/`evalLog`);
  the thin per-mode wrappers and per-channel files don't duplicate it. Don't copy logic between the
  brains — lift it to `ai/shared/`.
- **Minimal surface / no clutter.** Add a file only when something imports it; keep the service
  closure tight (`02-services.md`). No orphan files, speculative abstractions, single-use config,
  dead code, unused deps, or leftover archives. Reuse before adding.
- **Small, honest changes.** Change the minimum needed; keep edits focused and clearly scoped.
- **Fail loudly, typed.** Every cross-layer failure is a typed `ApplicationError`; never a silent
  `null` or a raw 500. The best-effort paths (telemetry, post-confirm history, post-turn send) log
  and continue — by explicit design, documented at the call site.

## Forbidden (each is a real failure mode)
| Pattern | Why |
|---|---|
| `throw new Error(...)` / `new ApplicationError` outside `errors/domains/` | bypasses the catalog → generic 500 |
| Importing a service impl file directly | breaks the `ServiceLocator` seam / circular imports |
| `prisma` in a router, middleware, assistant, channel, or tool handler | wrong layer — go through a service |
| The two brains importing each other | shared code belongs in `ai/shared/` |
| Deriving scope/RBAC from model args or a channel payload | tenant-crossing security hole (`07`) |
| Running a sensitive/write merchant tool without the confirm gate | bypasses the human-in-the-loop boundary |
| Returning a raw Prisma model / raw ids from a public method | leaks internals; not a DTO |
| Leaking an LLM/provider error, internal code, or tool name to the caller | the loop redacts; the router replies gracefully (`04`) |
| Numeric HTTP status / header-name / route-path / permission literals | use `HTTPS_STATUS_CODE` / `HTTP_HEADER` / `ALL_ROUTES` / `PERMISSIONS_MAP` |
| Adding a DTO / service / tool nothing imports | clutter — keep the closure minimal |
| Bumping a dependency off its pinned version without a boot smoke | runtime breakage `tsc` can't catch (`01`) |
| Editing `prisma/schema.prisma` to add behavior, or running a migration | the database is owned upstream — re-sync (`01`) |
| Mounting a route outside `serviceAuthMiddleware` (except `/health`) | breaks the internal-only boundary |
| Starting the worker from `buildApp()` / a test entry | spins a DB drain the tests never want |
| Committing `.env` / real credentials | secret leak |
| Naming another repo/plan/host in a code comment ("ported from the MCP host", "plan §7", a doc path) | provenance archaeology — explain the local *why* (`11`) |
| `console.log` debug / commented-out code / dead exports left behind | clutter |
| Marking work done with `tsc` errors or a failing boot smoke | not verified (`10`) |

## The escape hatch
If a rule seems wrong for the task, **surface it and ask** — don't silently bend it. Either the rule
updates, it's a genuine signed-off exception, or the design is off and needs fixing properly.
