# 01 — Dependencies & versions

**Status:** binding. **Read before adding, removing, or upgrading a dependency.**

The service's correctness depends on its dependencies behaving exactly as the code expects, and
type-checking alone cannot guarantee that — especially for the LLM path, where a change in `zod`
JSON-Schema output or streaming behavior is invisible to `tsc`.

## Pin versions — a bump is a behavior change
- Pin dependencies to **exact, known-good versions** (e.g. `zod` is pinned to `4.1.12`, no caret).
  A minor or patch bump can change a library's **runtime** behavior in a way `tsc` cannot see —
  `zod` in particular backs both DTO validation (`validateBody`) AND the model-facing tool schemas
  (`z.toJSONSchema(...)` in every tool registry), so a `zod` change can silently alter what the
  model is offered.
- **Bumping any dependency requires re-running the boot smoke** (`10-verification.md`), not just
  `npm run typecheck`. Runtime-only behavior is exactly what pinning protects against.
- Some deps are currently on a caret (`@prisma/client` / `prisma` are `^5.22.0`). That is drift, not
  the target — treat new pins as exact, and when you touch one of these, pin it to the installed
  version rather than widening further.

## The shared database — a client this service does NOT own
- `@prisma/client` / `prisma` generate a client against a schema owned **outside** this service.
  `prisma/` holds only `schema.prisma` (no `migrations/`) — the schema mirrors the authoritative
  database; when it changes, re-sync `schema.prisma` and run `npx prisma generate`. **Never migrate
  here, and never edit the schema to add behavior.** See `09-code-quality.md`.

## Keep the dependency surface minimal
- Add a dependency (or a source file) only when something actually imports it. No speculative or
  unused deps — they are clutter and an attack surface (`09-code-quality.md`).
- The runtime deps are deliberately few: `express`, `cors`, `zod`, `@prisma/client`, `dotenv`,
  `date-fns`, `posthog-node`. The LLM/WhatsApp/search transports are thin `fetch` wrappers in
  `src/lib/` — no SDKs. Don't pull in a provider SDK when a typed `fetch` wrapper already exists.

## Hard rules
- **Never** widen a pinned version (adding `^`/`~`) without a deliberate reason and a boot smoke.
- **Never** rely on `tsc` alone to validate a dependency change — run the boot smoke.
- **Never** add a dependency nothing imports.
- **Never** run a Prisma migration here, or edit `schema.prisma` to add behavior — re-sync instead.
