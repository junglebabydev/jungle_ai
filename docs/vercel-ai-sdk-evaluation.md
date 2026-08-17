# Vercel AI SDK — Should JUNGLE_AI Adopt It?

**Date:** 2026-07-27
**Repo:** `jungle_ai`
**Verdict:** ❌ **Do not migrate. Keep the current custom loop.**

---

## Recommendation Score

| Option | Score | Meaning |
|---|---|---|
| **Do NOT adopt (keep custom loop)** | **~85%** | Strongly recommended for the existing merchant + concierge assistants. |
| **Adopt / migrate to Vercel AI SDK** | **~15%** | Only sensible for a brand-new, standalone AI surface — not a rewrite. |

> The 15% is not zero: the SDK is a genuinely good tool. It's low **only because JUNGLE_AI has already hand-built its equivalents**, and those equivalents carry business- and security-specific behavior a migration would put at risk.

---

## 1. What the Vercel AI SDK Is (Plain English)

An open-source **TypeScript toolkit** that sits between your code and the LLM providers. Two parts:

- **AI SDK Core** — one unified way to call *any* model (`generateText` / `streamText`). Swap OpenAI ↔ Anthropic ↔ Google ↔ OpenRouter by changing one line. Handles streaming, **multi-step tool-calling loops**, structured output with Zod, retries, and provider fallback for you.
- **AI SDK UI** — React/Next.js hooks (`useChat`, `useCompletion`) that wire a chat UI to a streaming backend with almost no glue code.

Think of it as *"the thing that saves you from hand-writing the streaming parser, the tool-call assembler, and the model-swapping boilerplate."*

> Made by Vercel, but works on **any** Node backend and **any** host — you do **not** need to deploy on Vercel to use it.

---

## 2. What It's Genuinely Good For (Use Cases)

| Use case | Why the SDK fits well |
|---|---|
| **New Next.js / React app with a chat UI** | Its sweet spot — `useChat` + `streamText` = streaming chatbot in ~50 lines. |
| **Greenfield agent / tool-calling project** | Built-in multi-step tool loop (`stopWhen`, `maxSteps`) — you never hand-roll the loop. |
| **You swap / A-B models often** | Unified provider interface makes model swaps trivial. |
| **Structured extraction** (JSON out of text) | `generateObject` + Zod is very clean. |
| **Small team wanting to move fast** | Offloads streaming / parsing / retry maintenance to a supported library. |

**Not the right tool when:** you're on a Python ML stack (it's TS-only), or you need fine-grained control over the raw provider request/response (it abstracts that away — sometimes in your way).

---

## 3. What JUNGLE_AI Has Already Built By Hand

The critical point: JUNGLE_AI **already implements most of what the SDK would provide**, with heavy business-specific tuning.

| Concern | Where it lives | Notes |
|---|---|---|
| LLM client + streaming + fallback | `src/lib/openrouter.ts` (474 lines) | Per-model fallback chains (`AI_MODELS`, `CONCIERGE_MODELS`), per-model retry w/ backoff + `Retry-After`, SSE delta parsing, tool-call assembly. |
| Merchant agent loop | `src/ai/assistants/merchant/loop.ts` (611 lines) | Multi-step loop with `MAX_STEPS`, per-turn token budget, history cap. |
| Concierge agent loop | `src/ai/assistants/concierge/loop.ts` (920 lines) | Independent fast-model chain, search-first behavior. |
| Security guard | `src/ai/shared/guard.ts` | Input screening, output redaction, **mid-stream redactor** (can reset a reply mid-stream) — OWASP LLM01/02. |
| Human-in-the-loop gate | `src/ai/assistants/merchant/gate.ts` | Confirmation cards for sensitive write tools. |
| Provider-specific tricks | `src/lib/openrouter.ts` | **Per-merchant OpenRouter "app" attribution** via `HTTP-Referer` / `X-Title` slugging, `data_collection: "deny"` governance, pinned `provider.order` for fast DeepSeek hosts. |
| Telemetry + evals | `src/ai/shared/evalLog.ts`, `tests/ai/**` | PostHog telemetry + `eval:merchant` / `eval:concierge` harness. |

The SDK would **not add a new capability** here — it would **replace working, hardened code** with its own equivalents.

---

## 4. Why NOT to Adopt (the 85% case)

1. **Rewrite risk with zero new feature.** Streaming, fallback, tool loops, and structured I/O already work. The guard + HITL gate are the crown jewels (mid-stream redaction, OWASP protections). Re-expressing those inside the SDK's abstractions is risky work with no user-visible upside.

2. **Your OpenRouter usage is unusually custom — exactly where an abstraction fights you.** Per-merchant `HTTP-Referer` app attribution, independent merchant-vs-concierge model chains, per-model retry semantics, and pinned provider order are things the SDK hides or makes awkward. You'd constantly reach *around* the SDK.

3. **A dependency is a maintenance surface.** The SDK moves fast and has shipped breaking major versions. Current code depends only on `fetch` + `zod` — extremely stable. For a backend service, "boring and stable" is a feature.

4. **No React/Next frontend benefit applies.** The SDK's biggest win (`useChat`) is for the UI layer. JUNGLE_AI is a backend compute service (booking owns the client-facing routers, per `src/routers/aiRunRouter.ts`), so that value is zero here.

---

## 5. When It WOULD Be Worth Reconsidering (the 15% case)

- A **brand-new AI surface from scratch** (not extending merchant/concierge) — building it on the SDK could beat copying the custom loop.
- Maintaining the hand-rolled SSE / tool-assembly code becomes a real team time sink.
- You add a **Next.js chat frontend** owned by this team and want `useChat`.

In those cases: adopt it **for the new surface only** — never a big-bang replacement of the existing loops.

---

## 6. Bottom Line

The Vercel AI SDK is an excellent toolkit for **new** TypeScript AI/chat projects, especially with a React frontend. But JUNGLE_AI has already hand-built its equivalents with business- and security-specific behavior the SDK would obscure rather than improve.

**Cost of adopting** (rewrite risk on hardened code, fighting the abstraction on a custom OpenRouter setup, a fast-moving dependency) **clearly outweighs the benefit** (none new).

➡️ **Keep the current implementation. Adopt: ~15% · Don't adopt: ~85%.**
