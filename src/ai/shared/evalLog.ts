import { randomUUID } from "crypto";
import { basePostHogProps, getPostHog } from "../../lib/posthog";

/**
 * Assistant observability — offloaded to PostHog LLM analytics (was: the AiToolCall /
 * AiModelCall Postgres tables). One $ai_generation event per model round-trip and
 * one $ai_span per tool call, grouped under a per-conversation trace. Cost comes
 * from OpenRouter's authoritative usage (`costUsd`), not PostHog's estimate.
 *
 * Fire-and-forget + batched (the PostHog client buffers and flushes in the
 * background); failures are logged, never thrown — observability must never break
 * a chat turn. This is analytics, NOT a system of record (PostHog ingestion is
 * at-least-once and can drop on a hard crash); acceptable for monitoring.
 */

/** One LLM round-trip. Mirrors what the loop assembles per model call. */
export type ChatModelEvent = {
  conversationId: number;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  finishReason: string | null;
  /** Tool names the assistant requested in this round-trip (if any). */
  toolNames?: string[];
  /** True when the model call itself failed (provider error, no response). */
  isError?: boolean;
  /** Error detail when isError — server-side only (never merchant-facing). */
  errorMessage?: string | null;
};

/** One tool dispatch (or parked / confirmed / declined sensitive call). */
export type ChatToolEvent = {
  conversationId: number;
  toolName: string;
  argsJson: unknown;
  gated: boolean;
  isError: boolean;
  code: string | null;
  resultJson: unknown;
  latencyMs: number;
  /** True for a sensitive tool executed via the /ai/confirm gate. */
  confirmed?: boolean;
};

/** Identity stamped on every event so logs are attributable + filterable. */
export type ChatTelemetryContext = {
  conversationId: number;
  merchantId: number;
  locationId: number | null;
  userId: number;
  /** Originating route — defaults to the chat turn; the confirm gate overrides. */
  api?: string;
  /** Store name — when present, names the PostHog `merchant` group (groupIdentify). */
  merchantName?: string;
};

const SOURCE = "ai-agent";
const DEFAULT_API = "POST /api/v1/ai/chat";

/**
 * Emit a turn's model + tool telemetry to PostHog. No-op when PostHog isn't
 * configured (no key) so local/dev without a key still works.
 */
export function emitMerchantTelemetry(
  ctx: ChatTelemetryContext,
  toolEvents: ChatToolEvent[],
  modelEvents: ChatModelEvent[],
  /** Optional per-turn rollup — when present, a $ai_trace summary is emitted. */
  turn?: { error?: string | null },
): void {
  const client = getPostHog();
  if (!client) return;

  const distinctId = `user-${ctx.userId}`;
  // Group-analytics: attribute every event to the merchant (multi-tenant). Passed
  // on each capture (backend libs have no session). Linking requires person
  // processing on — which it is for these user-tied agent events.
  const groups = { merchant: String(ctx.merchantId) };
  // A conversation == one trace; generations/spans across its turns group here.
  const traceId = `conversation-${ctx.conversationId}`;
  // PostHog "Url / Screen" column = the API route PATH that handled this turn
  // (e.g. /api/v1/ai/chat). Matches the api_incident middleware (req.originalUrl);
  // path-only keeps it env-free — no host/base-url config needed.
  const api = ctx.api ?? DEFAULT_API;
  const apiPath = api.split(" ").pop() ?? api; // "POST /api/v1/ai/chat" → "/api/v1/ai/chat"

  // Metadata on EVERY event: service/env (base) + source/api + the scope ids.
  const identity = {
    ...basePostHogProps(),
    source: SOURCE,
    api,
    conversationId: ctx.conversationId,
    merchantId: ctx.merchantId,
    locationId: ctx.locationId,
    userId: ctx.userId,
    $current_url: apiPath,
    $ai_trace_id: traceId,
  };

  try {
    // Name the merchant group (idempotent) so it shows by store name, not id.
    if (ctx.merchantName) {
      client.groupIdentify({
        groupType: "merchant",
        groupKey: groups.merchant,
        properties: { name: ctx.merchantName },
      });
    }

    // Per-turn summary ($ai_trace): rollup of cost/tokens/steps + overall error,
    // so a turn is one filterable record on top of its per-call generations/spans.
    if (turn !== undefined) {
      const errored =
        !!turn.error ||
        modelEvents.some((m) => m.isError) ||
        toolEvents.some((t) => t.isError);
      client.capture({
        distinctId,
        event: "$ai_trace",
        groups,
        properties: {
          ...identity,
          $ai_span_name: "agent-turn",
          $ai_is_error: errored,
          ...(turn.error ? { $ai_error: turn.error } : {}),
          $ai_latency: modelEvents.reduce((s, m) => s + m.latencyMs, 0) / 1000,
          steps: modelEvents.length,
          tool_call_count: toolEvents.length,
          tool_error_count: toolEvents.filter((t) => t.isError).length,
          input_tokens: modelEvents.reduce(
            (s, m) => s + (m.promptTokens ?? 0),
            0,
          ),
          output_tokens: modelEvents.reduce(
            (s, m) => s + (m.completionTokens ?? 0),
            0,
          ),
          total_cost_usd: modelEvents.reduce((s, m) => s + (m.costUsd ?? 0), 0),
        },
      });
    }

    for (const m of modelEvents) {
      client.capture({
        distinctId,
        event: "$ai_generation",
        groups,
        properties: {
          ...identity,
          $ai_span_id: randomUUID(),
          $ai_model: m.model,
          $ai_provider: "openrouter",
          $ai_input_tokens: m.promptTokens ?? 0,
          $ai_output_tokens: m.completionTokens ?? 0,
          // OpenRouter's authoritative charged cost. Omit when an interrupted
          // stream gave none, so PostHog falls back to its token-price estimate.
          ...(m.costUsd != null ? { $ai_total_cost_usd: m.costUsd } : {}),
          $ai_latency: m.latencyMs / 1000, // PostHog expects seconds
          $ai_is_error: m.isError ?? false,
          ...(m.isError && m.errorMessage ? { $ai_error: m.errorMessage } : {}),
          // Which tools this round-trip asked to call (the $ai_span events carry
          // each call's args/result; this lists them on the generation too).
          ...(m.toolNames && m.toolNames.length
            ? { tool_calls: m.toolNames }
            : {}),
          finish_reason: m.finishReason ?? undefined,
        },
      });
    }

    for (const t of toolEvents) {
      client.capture({
        distinctId,
        event: "$ai_span",
        groups,
        properties: {
          ...identity,
          $ai_span_id: randomUUID(),
          $ai_span_name: t.toolName,
          $ai_latency: t.latencyMs / 1000,
          $ai_is_error: t.isError,
          ...(t.isError && t.code ? { $ai_error: t.code } : {}),
          $ai_input_state: t.argsJson,
          $ai_output_state: t.resultJson,
          tool_name: t.toolName,
          gated: t.gated,
          confirmed: t.confirmed ?? false,
          error_code: t.code ?? undefined,
        },
      });
    }
  } catch (e) {
    console.error(
      "[agent] PostHog telemetry emit failed (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
}

const CONCIERGE_SOURCE = "ai-concierge";
const CONCIERGE_DEFAULT_API = "POST /api/v1/concierge/chat";

/**
 * Telemetry for the PUBLIC concierge — same $ai_trace/$ai_generation/$ai_span
 * shapes as the merchant agent, but anonymous: keyed on the conversation (no
 * merchant group, no user id), so cost/latency/tool-use/errors are still
 * observable per turn for monitoring and eval without any PII. No-op without a
 * PostHog key; never throws (observability must not break a turn).
 */
export function emitConciergeTelemetry(
  ctx: { conversationId: number; api?: string },
  toolEvents: ChatToolEvent[],
  modelEvents: ChatModelEvent[],
  turn?: { error?: string | null },
): void {
  const client = getPostHog();
  if (!client) return;

  const distinctId = `concierge-${ctx.conversationId}`;
  const traceId = `concierge-conversation-${ctx.conversationId}`;
  const api = ctx.api ?? CONCIERGE_DEFAULT_API;
  const apiPath = api.split(" ").pop() ?? api;
  const identity = {
    ...basePostHogProps(),
    source: CONCIERGE_SOURCE,
    api,
    conversationId: ctx.conversationId,
    $current_url: apiPath,
    $ai_trace_id: traceId,
  };

  try {
    if (turn !== undefined) {
      const errored =
        !!turn.error ||
        modelEvents.some((m) => m.isError) ||
        toolEvents.some((t) => t.isError);
      client.capture({
        distinctId,
        event: "$ai_trace",
        properties: {
          ...identity,
          $ai_span_name: "concierge-turn",
          $ai_is_error: errored,
          ...(turn.error ? { $ai_error: turn.error } : {}),
          $ai_latency: modelEvents.reduce((s, m) => s + m.latencyMs, 0) / 1000,
          steps: modelEvents.length,
          tool_call_count: toolEvents.length,
          tool_error_count: toolEvents.filter((t) => t.isError).length,
          input_tokens: modelEvents.reduce((s, m) => s + (m.promptTokens ?? 0), 0),
          output_tokens: modelEvents.reduce(
            (s, m) => s + (m.completionTokens ?? 0),
            0,
          ),
          total_cost_usd: modelEvents.reduce((s, m) => s + (m.costUsd ?? 0), 0),
        },
      });
    }

    for (const m of modelEvents) {
      client.capture({
        distinctId,
        event: "$ai_generation",
        properties: {
          ...identity,
          $ai_span_id: randomUUID(),
          $ai_model: m.model,
          $ai_provider: "openrouter",
          $ai_input_tokens: m.promptTokens ?? 0,
          $ai_output_tokens: m.completionTokens ?? 0,
          ...(m.costUsd != null ? { $ai_total_cost_usd: m.costUsd } : {}),
          $ai_latency: m.latencyMs / 1000,
          $ai_is_error: m.isError ?? false,
          ...(m.isError && m.errorMessage ? { $ai_error: m.errorMessage } : {}),
          ...(m.toolNames && m.toolNames.length ? { tool_calls: m.toolNames } : {}),
          finish_reason: m.finishReason ?? undefined,
        },
      });
    }

    for (const t of toolEvents) {
      client.capture({
        distinctId,
        event: "$ai_span",
        properties: {
          ...identity,
          $ai_span_id: randomUUID(),
          $ai_span_name: t.toolName,
          $ai_latency: t.latencyMs / 1000,
          $ai_is_error: t.isError,
          ...(t.isError && t.code ? { $ai_error: t.code } : {}),
          $ai_input_state: t.argsJson,
          $ai_output_state: t.resultJson,
          tool_name: t.toolName,
        },
      });
    }
  } catch (e) {
    console.error(
      "[concierge] PostHog telemetry emit failed (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
}
