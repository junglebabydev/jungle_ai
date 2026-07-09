# 06 — AI assistants (the two brains)

**Status:** binding. **Read whenever you touch anything under `src/ai/` — a tool, the loop, the
gate, the guard, a prompt, or a channel.** This is the core of the service.

There are **two brains** and one rule that explains their layout: a symbol that belongs to one brain
is **qualified by that brain**; brain-agnostic plumbing is **unqualified**. Never the bare word
"agent" for something that belongs to one brain.

```
src/ai/
├── assistants/
│   ├── merchant/        the store-config assistant — RBAC, ownership, a confirm gate on every write
│   │   ├── loop.ts            runMerchantTurn (the tool-calling loop)
│   │   ├── dispatch.ts        dispatchTool — per-tool Zod + RBAC + ownership re-check, then run
│   │   ├── gate.ts            createConfirmation / executeConfirmation (server-authoritative confirm)
│   │   ├── ownership.ts       assertResourceOwnership — model-supplied id must resolve to the scope
│   │   ├── errors.ts          toToolFailure / toolOk — relay a typed error as a ToolResult
│   │   ├── merchantSystemPrompt.ts   the load-bearing prompt (+ systemPromptHash)
│   │   ├── manifest.ts        field manifest (prompts the human; does NOT validate)
│   │   └── tools/             registry.ts (ALL_TOOLS, TOOLS_BY_NAME, MERCHANT_TOOLS) + one file per tool group
│   └── concierge/       the parent-facing search assistant — READ-ONLY, no RBAC, no writes, no gate
│       ├── loop.ts            runConciergeTurn (the shared engine)
│       ├── productDiscovery.ts       runProductDiscovery — thin entry, no scope (global search)
│       ├── merchantLocationChat.ts   runMerchantLocationChat — thin entry, pinned to one venue
│       ├── productDiscoveryPrompt.ts / merchantLocationPrompt.ts / promptShared.ts
│       ├── venueContext.ts    buildVenueContext (preloaded per-venue profile)
│       └── tools/             registry.ts (conciergeToolsFor, CONCIERGE_TOOLS_BY_NAME) + search.ts, activityDetails.ts
├── channels/
│   └── whatsapp/merchant.ts   WhatsApp × merchant transport (processInboundJob) — a peer to the router
└── shared/               used by BOTH brains — brain-agnostic ONLY
    ├── guard.ts               screenInput / redactReply / createStreamRedactor / spotlightToolResult / SAFE_REFUSAL
    └── evalLog.ts             emitMerchantTelemetry / emitConciergeTelemetry (PostHog)
```

## The turn-runner is the entry point
A brain is reached through its turn-runner, never by a router importing its internals:
- **Merchant:** `runMerchantTurn(input)` (`loop.ts`), plus `executeConfirmation(nonce, approve)`
  (`gate.ts`). `merchantChatRouter` and `channels/whatsapp/merchant.ts` both call these.
- **Concierge:** `runProductDiscovery(input)` (global) and `runMerchantLocationChat(input)` (venue-
  pinned) — thin wrappers over `runConciergeTurn(input)` in `loop.ts`. Splitting them keeps each mode
  readable while the engine stays in one place (DRY). `conciergeRouter` calls the wrappers.

Both turn-runners take a typed `Run<Brain>TurnInput` and return a typed `Run<Brain>TurnResult`.
Optional `onToken`/`onReset` callbacks drive the SSE path (`05-http-layer.md`).

## The tool contract (SRP + DIP)
A tool is a self-contained definition plus a pure-ish handler. **Handlers depend only on
`ServiceLocator` (+ the pinned scope)** — never on transport, `req`, or another tool — so each tool
is unit-testable with a mocked locator.

**Merchant tool** (`tools/types.ts`, built with `defineTool`): `{ name, description, input (Zod
shape — model-facing args ONLY; merchantId/locationId are pinned via MerchantScope), requiredPermissions
(a fixed list or a function of args, PERMISSIONS_MAP codes), sensitive (write ⇒ true), preParkValidate?,
handler }`. Registered in `tools/registry.ts` (`ALL_TOOLS` → `TOOLS_BY_NAME` + `MERCHANT_TOOLS`).

**Concierge tool** (`tools/types.ts`): `{ name, definition (OpenRouter), scopedOnly?, run(args, ctx) }`.
No RBAC, no ownership, no sensitivity — all concierge data is public. Registered in `tools/registry.ts`
(`ALL_CONCIERGE_TOOLS` → `CONCIERGE_TOOLS_BY_NAME`; `conciergeToolsFor(scoped)` filters `scopedOnly`).

To add a tool: create its file under `tools/`, then list it in that brain's `registry.ts`. The
registry is the single source of the tool set (consumed by the loop and the eval harness), so both
see exactly the same tools — never hardcode a tool list in the loop.

## The merchant loop (`runMerchantTurn`)
1. **Input screen** (`guard.screenInput`) — deterministically refuse prompt-extraction / rule-override
   BEFORE any model call. Blocked ⇒ `SAFE_REFUSAL`, log `[merchant.security]` (ids only), persist.
2. **RBAC once** (`resolvePermissions(scope)`) + capped history load, in parallel.
3. **Tool-calling loop** (bounded by `MAX_STEPS` and a per-turn token budget): stream the step
   through `createStreamRedactor`; for each tool call —
   - a **read** tool → `dispatchTool` (Zod-validate → ownership re-check → RBAC → run);
   - a **sensitive/write** tool → validate + `assertResourceOwnership` + `preParkValidate`, then
     **park** an `AiPendingAction` via `gate.createConfirmation` and return a
     `CONFIRMATION_REQUIRED` result. One confirmation per turn; a parked write ends the turn.
   - tool results are framed with `spotlightToolResult` (untrusted data, not instructions).
4. **Output redaction** (`guard.redactReply`) scrubs the returned/persisted reply.
5. **Persist** USER/ASSISTANT turns (skipped for ephemeral `persistTurns:false` follow-ups).
6. **Telemetry** (`emitMerchantTelemetry`) in `finally` — fires even when the turn throws.

`executeConfirmation` (the `/ai/confirm` path) re-derives scope from the conversation and re-checks
RBAC + ownership exactly like the loop — the model's intent never re-enters. It is single-use.

## The concierge loop (`runConciergeTurn`)
Read-only, but reuses the SAME defenses: `screenInput`, `spotlightToolResult`, `createStreamRedactor`
(with concierge-specific leak signatures + strippable public-data blocks), `redactReply` (with its own
audience-appropriate refusal). Extra concierge-specific behavior: a deterministic child-safety net
before any model call, deterministic multi-turn context carry, a "guarantee data" backfill so the
parent never faces an empty grid, and an optional flag-gated search-first path. Telemetry via
`emitConciergeTelemetry` (anonymous, keyed on the conversation). No RBAC, no dispatch, no gate.

## The guard is defense-in-depth, NOT the boundary (`ai/shared/guard.ts`)
The security boundary is the confirm gate + per-tool RBAC/ownership (they hold even if the prompt is
known or the model is jailbroken). The guard is cheap deterministic layering: `screenInput` in front,
`redactReply` / `createStreamRedactor` behind (whole-reply refusal on a leak signature; internal ids
stripped inline; a fixed hold-back window makes streaming leak-proof), `spotlightToolResult` framing.
`redactReply` and `createStreamRedactor` are **overridable** (refusal text + extra signatures + strip
blocks) so the concierge supplies its own — the shared `LEAK_SIGNATURES` always apply. Never rely on
the guard for access control.

## Scope is pinned server-side, never from the model
Both brains pin scope from the verified request context, never from tool args:
- Merchant: `MerchantScope { merchantId, locationId?, userId }` from the conversation; `dispatch` +
  `ownership.assertResourceOwnership` re-verify every model-supplied resource id resolves to it
  (coerce string ids — a `typeof === "number"` check would skip the re-check and let a foreign id
  through). See `07-rbac-and-identity.md`.
- Concierge: `ConciergeToolContext` pins `sections`, `scope` (venue), FE filter chips — the search
  tool applies them regardless of what the model puts in its args.

## Channels (`ai/channels/<channel>/<brain>.ts`)
One transport file per (channel × brain) pairing — a peer to the router, NOT a service, reached only
from its worker. It normalizes the inbound message, derives scope **exclusively from the verified
binding** (the `WhatsappLink`, never the payload), calls the brain's turn-runner, and formats + sends
the reply (per-channel formatting lives here — e.g. the WhatsApp tone `systemSuffix`, markdown-to-
WhatsApp normalization, confirm buttons). To put a brain on a new channel, add a sibling file; nothing
else moves.

## Prompts
The system prompt is the single source — the loop AND the eval harness import the exact same text, so
an eval scores the real prompt. `merchantSystemPrompt(ctx)` (+ `systemPromptHash` to pin a conversation
to a prompt version); the concierge has `productDiscoverySystemPrompt` / `merchantLocationSystemPrompt`.
Enum lists in a prompt are derived from the Prisma enum, never hand-maintained. Edit the prompt in
place; never fork it.

## Naming (brain-qualified vs shared)
| Kind | Merchant | Concierge | Shared |
|---|---|---|---|
| Turn runner | `runMerchantTurn` | `runConciergeTurn` (`runProductDiscovery`/`runMerchantLocationChat`) | — |
| Turn input/result | `RunMerchantTurnInput/Result` | `RunConciergeTurnInput/Result` | — |
| System prompt | `merchantSystemPrompt` | `productDiscoverySystemPrompt` | — |
| Scope type | `MerchantScope` | `ConciergeScope` / `ConciergeToolContext` | — |
| Tool list const | `MERCHANT_TOOLS` | `CONCIERGE_TOOLS_BY_NAME` | — |
| Telemetry emit | `emitMerchantTelemetry` | `emitConciergeTelemetry` | — |
| Security log prefix | `[merchant.security]` | `[concierge.security]` / `[concierge.safety]` | — |
| Guard / telemetry types | — | — | `guard`, `evalLog`, `ChatModelEvent`, `ChatToolEvent` |

`Ai*` identifiers (`AiTurn`, `AiPendingAction`, `AI_TURN_ROLE`, `AI_PENDING_STATUS`) are Prisma model
types/enums — they keep their generated names.

## Hard rules
- **Never** let the two brains import each other — shared code goes in `ai/shared/`.
- **Never** import a service file directly from a tool/loop/channel — go through `ServiceLocator`.
- **Never** call `prisma` from a tool handler.
- **Never** derive scope, ownership, or RBAC from the model's tool args or a channel payload — only
  from the verified conversation/binding scope.
- **Never** execute a sensitive/write merchant tool without the confirm gate; never re-run a
  confirmed nonce (single-use).
- **Never** rely on the guard for access control — the gate + RBAC + ownership are the boundary.
- **Never** hardcode a tool list in the loop — the registry is the single source.
- **Never** return a raw provider/LLM error, an internal code, or a tool name to the caller — the
  loop redacts and the router replies gracefully (`04-errors.md`).
- **Never** fork the system prompt — edit it in place so the eval scores the real thing.
- **Never** use the bare word "agent" for a symbol/file that belongs to one brain — qualify it.
