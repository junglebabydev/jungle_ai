# 08 — Naming conventions

**Status:** binding. **Read when creating any file, folder, or symbol.** Mirror what already exists.

## Files & folders
| Kind | Path | Convention |
|---|---|---|
| Router | `src/routers/<resource>Router.ts` | lowerCamelCase + `Router.ts` |
| Middleware | `src/middleware/<name>.ts` | lowerCamelCase (`serviceAuthMiddleware.ts`) |
| Ownership guard | `src/middleware/ownership/require<Resource>Owner.ts` | `require<PascalCase>Owner.ts` |
| Service folder | `src/services/<domain>/` | kebab-case |
| Service files | inside it | exactly `service.interface.ts`, `service.ts`, `service.internal.ts` |
| Service registry | `src/services/index.ts` | one file (`ServiceLocator`) |
| Orchestrator | `src/orchestration/<workflow>/<workflow>.orchestrator{.interface}.ts` | kebab folder + `.orchestrator` suffix |
| AI assistant | `src/ai/assistants/<brain>/` | brain named by AUDIENCE (`merchant/`, `concierge/`) |
| AI assistant files | inside it | lowerCamelCase; the prompt is `<brain>SystemPrompt.ts` |
| AI channel | `src/ai/channels/<channel>/<brain>.ts` | one file per (channel × brain) |
| AI shared | `src/ai/shared/<name>.ts` | lowerCamelCase; brain-agnostic only (`guard.ts`, `evalLog.ts`) |
| Worker | `src/worker/<name>Worker.ts` | lowerCamelCase + `Worker.ts` |
| Auth resolver | `src/auth/<name>-resolver.ts` | kebab-case |
| Error catalog | `src/errors/domains/<Name>Error.ts` | PascalCase + `Error.ts` |
| DTO file | `src/shared/dtos/<Name>DTOs.ts` | PascalCase + `DTOs.ts` |
| Shared type | `src/shared/types/<name>.ts` | kebab-case |
| Lib / config / util | `src/{lib,config,utils}/<name>.ts` | lowerCamelCase |

`shared/dtos/` and `shared/types/` are flat.

## Symbols
- Interfaces: `I<Name>Service` / `I<Name>ServiceInternal`. Implementations: `<Name>Service` /
  `<Name>ServiceInternal` (PascalCase, no prefix).
- DTOs: `Create<Name>Schema` → `Create<Name>DTO` (inferred); `<Name>ResponseDTO`;
  `map<Name>ResponseDTO`; list keys `<RESOURCE>_ORDER_BY_KEYS` → `<Name>OrderByKey`; `<Name>Filter`.
- Errors: catalog `<Domain>Error`; codes `<PREFIX>_<NNN>` (3-digit, sequential, never reused).
- Constants/enums: `UPPER_SNAKE_CASE` catalogs (`PERMISSIONS_MAP`, `ALL_ROUTES`, `HTTPS_STATUS_CODE`,
  `HTTP_HEADER`, role enums).
- Variables/functions: camelCase; booleans `is`/`has`/`with` (`isWhatsappConfigured`, `scoped`);
  module-private helpers `_name` (`_resetVenueContextCache`).

## The two-brain naming rule (from `06-ai-assistants.md`)
A symbol belonging to ONE brain is qualified by that brain (`runMerchantTurn`, `MERCHANT_TOOLS`,
`merchantSystemPrompt`, `MerchantScope`, `emitConciergeTelemetry`, `[merchant.security]`). A symbol
shared by both is brain-agnostic (`guard`, `evalLog`, `ChatModelEvent`, `ChatToolEvent`). **Never**
the bare word "agent" for a one-brain symbol. `Ai*` Prisma model names are generated — keep them.

## Shared / connecting values have the SAME name on both sides
A value that wires two services together has ONE name in both codebases, so the wire is obvious:
`JUNGLE_AI_API_KEY` (booking ↔ jungle_ai), `SEARCH_ENGINE_API_KEY` / `SEARCH_ENGINE_URL`
(jungle_ai ↔ search_engine), `x-jungle-user-id` (the forwarded identity header). Never give the same
value two names.

## Grandfathered typos — do NOT "fix" them
Several names carry typos that are now stable (imported widely / a stable code contract). Leave them;
new names use the correct spelling. Known: `service.interafce.ts` (merchant), `IUSerService`,
`ILocationUserServiceInernal`, `shared/types/role-permision.ts`, `ALL_ROUTES.HEALTH_CHECK`,
`AuthError.AccessDenied` message "Access deinied!", `GenericError` "Somthing went wrong!". Renaming a
widely-imported symbol just to fix casing is churn — surface it, don't do it silently.

## Hard rules
- **Never** invent a new pattern when one already exists — mirror it.
- **Never** mix casing within a folder, or drop the `Router.ts` / `DTOs.ts` / `Error.ts` /
  `Worker.ts` / `.orchestrator.ts` suffixes.
- **Never** name the same shared value differently across the two services.
- **Never** rename a grandfathered typo silently — surface it; the rule applies to new names.
