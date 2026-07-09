# 03 — DTOs and validation

**Status:** binding. **Read when adding or changing a DTO, Zod schema, or mapper.**

DTOs are the contract between HTTP/JSON (and the model-facing tool args) and the service layer. One
file per resource at `src/shared/dtos/<Name>DTOs.ts`, colocating: the Zod request schema(s), the
inferred request DTO type, the `<Name>ResponseDTO` type, and the `map<Name>ResponseDTO(model, opts)`
mapper. For a list resource, also the `<RESOURCE>_ORDER_BY_KEYS` const, the `<Name>OrderByKey`
union, and the `<Name>Filter` type.

## Conventions
- The request schema is the source of truth; the request DTO type is **inferred**
  (`type CreateXDTO = z.infer<typeof CreateXSchema>`) — never hand-written alongside. Update schemas
  derive: `UpdateXSchema = CreateXSchema.partial()`. Variant-by-discriminator uses
  `.safeExtend({ ... })` (e.g. `ProductDTOs`), cross-field invariants use `.superRefine(...)`.
- The Response DTO is a plain TypeScript type. **Strip internal fields** (`isArchived`, tokens,
  Stripe ids, etc.). Related entities are optional (`?:`) and populated by the mapper only when the
  caller loaded them (`opts`).
- Mappers are **pure projections** — no `prisma` calls, no business logic, no computed totals. They
  convert Prisma `Decimal` → `number` (`NumberUtils.decimalToNumber`) and delegate nested entities
  to their own mappers (`mapProductResponseDTO` → `mapLocationResponseDTO`, `mapMerchantResponseDTO`,
  `mapProductCategoryResponseDTO`).
- Pagination uses `PaginatedResponseDTO<T, K>` (`PaginationDTO.ts`). The list method calls
  `normalizePagination(filter, <RESOURCE>_ORDER_BY_KEYS)` (validates `orderBy` against the allowlist,
  throws `BadRequestError.OrderByKeyNotAllowed`) and wraps rows with `buildPaginatedResponse` — never
  a raw `T[]`. The Filter type is `z.infer<typeof <X>FilterSchema> & PaginatedRequestDTO<K>`.

## Two DTO surfaces, one home
This service validates at TWO boundaries — keep both schemas in the DTO folder:
1. **HTTP bodies** — `validateBody(<X>Schema)` middleware parses `req.body` (e.g.
   `MerchantChatSchema`, `ConciergeChatSchema`, `WhatsappLinkSchema`, `CreateAiEvalReportSchema`).
2. **Model-facing tool args** — the AI tools define a `zod` input shape parsed inside the loop
   (`dispatch.ts` for merchant, the concierge tool's `safeParse`). A tool's Zod shape lives WITH its
   tool file under `ai/assistants/<brain>/tools/` (it is model-legible, described per field for the
   LLM) — that is the ONE allowed home for a Zod schema outside `shared/dtos/`, because it is the
   tool's contract, not a resource DTO. See `06-ai-assistants.md`.

The concierge search tool re-grounds every field server-side against the real vocabulary, so a bad
model-supplied filter broadens the search, never errors — reject only structurally-invalid input.

## Hard rules
- **Never** hand-write a DTO type that should be `z.infer<...>`.
- **Never** leak internal fields (`isArchived`, tokens, Stripe/provider ids) in a Response DTO.
- **Never** call `prisma` or add business logic inside a mapper.
- **Never** return a Prisma `Decimal` unconverted, or a list as a raw array.
- **Never** hand-write a `<Name>OrderByKey` union — derive it from `<RESOURCE>_ORDER_BY_KEYS`.
- **Never** put a resource DTO's Zod schema outside `shared/dtos/`. A tool's own input shape is the
  only Zod that lives with its tool.
