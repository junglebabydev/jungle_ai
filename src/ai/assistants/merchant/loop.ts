import { AI_TURN_ROLE, AiTurn, Prisma } from "@prisma/client";
import { resolvePermissions } from "../../../auth/permission-resolver";
import {
  ChatStreamEvent,
  OpenRouterMessage,
  streamChatCompletion,
} from "../../../lib/openrouter";
import { ServiceLocator } from "../../../services";
import ApplicationError from "../../../errors/ApplicationError";
import { dispatchTool } from "./dispatch";
import { ToolResult, toToolFailure } from "./errors";
import { createConfirmation } from "./gate";
import { assertResourceOwnership } from "./ownership";
import {
  screenInput,
  SAFE_REFUSAL,
  redactReply,
  createStreamRedactor,
  spotlightToolResult,
} from "../../shared/guard";
import { ChatModelEvent, ChatToolEvent, emitMerchantTelemetry } from "../../shared/evalLog";
import { merchantSystemPrompt } from "./merchantSystemPrompt";
import { MERCHANT_TOOLS, TOOLS_BY_NAME } from "./tools/registry";
import { MerchantScope } from "./tools/types";

/** Only the last N turns are sent to the model (history cap, plan §12.4). */
const HISTORY_LIMIT = 24;
/** Max sequential model round-trips per chat request (ported from the MCP host). */
const MAX_STEPS = 8;
/** Per-turn token budget — once a turn's cumulative tokens exceed this, stop
 *  making further model calls (cost guard / Denial-of-Wallet, OWASP). */
const TURN_TOKEN_BUDGET = 120_000;

export type RunMerchantTurnInput = {
  conversationId: number;
  scope: MerchantScope;
  /** For the system prompt + OpenRouter app-attribution. */
  merchantName: string;
  model: string;
  userMessage: string;
  /** Optional: stream the assistant's reply tokens as they arrive (SSE path). */
  onToken?: (delta: string) => void;
  /** Optional (SSE path): discard everything streamed so far for this turn. Sent
   *  when a tool-call preamble that leaked past the hold-back must be cleared, or
   *  when a leak signature trips mid-stream and the reply becomes SAFE_REFUSAL.
   *  The client drops its accumulated text and re-renders from the next token. */
  onReset?: () => void;
  /** When false, don't persist this turn to history — used for the ephemeral
   *  "show the updated state" follow-up after a confirmed write, which is UI-only
   *  (the real change already landed; the summary shouldn't pollute history). */
  persistTurns?: boolean;
  /** Originating channel/route for telemetry attribution (PostHog `api`/url).
   *  Defaults to the web chat route; the WhatsApp channel overrides it so its
   *  turns are filterable separately. */
  api?: string;
  /** Optional channel-specific addendum appended to the system prompt (e.g. the
   *  WhatsApp tone: short, mobile-first, no tables). Empty for web. */
  systemSuffix?: string;
};

export type PendingConfirmation = {
  nonce: string;
  toolName: string;
  label: string;
};

export type RunMerchantTurnResult = {
  reply: string;
  pending: PendingConfirmation[];
};

/** USER/ASSISTANT turns are replayed as chat history; tool plumbing is per-turn. */
function turnToMessage(turn: AiTurn): OpenRouterMessage {
  const role = turn.role === AI_TURN_ROLE.USER ? "user" : "assistant";
  return { role, content: turn.content };
}

/**
 * Fail-safe label for a sensitive tool that has no explicit case in
 * `pendingVerb` (e.g. a newly-added tool whose case was forgotten). Turns the
 * raw tool name into readable prose so a merchant NEVER sees the internal
 * function name on a confirm card, and the derived park message never trips the
 * output guard's tool-name signature (which would otherwise nuke the reply to a
 * canned refusal). This is the structural guarantee that a future tool cannot
 * silently reintroduce the leak — OWASP LLM02 (output filtering / no
 * implementation-detail disclosure) + human-readable HITL confirmation.
 */
const ACTION_VERB_LABEL: Record<string, string> = {
  upsert: "Update",
  update: "Update",
  create: "Add",
  add: "Add",
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Remove",
  unarchive: "Restore",
  cancel: "Cancel",
  delete: "Remove",
};
export function humanizeActionVerb(toolName: string): string {
  const parts = toolName.split("_").filter(Boolean);
  const verb = ACTION_VERB_LABEL[parts[0]];
  // Unknown verb → generic, safe phrase (never the raw name or its tokens).
  if (!verb) return "Apply change";
  const noun = parts.slice(1).join(" ");
  return noun ? `${verb} ${noun}` : verb;
}

/** The action phrase shown on a confirm card, derived from the tool + its args
 *  (so an upsert reads "Create …" vs "Update …", and a schedule reads
 *  "Cancel session for …" vs "Add schedule for …"). pendingLabel appends the
 *  resource name when it can resolve one. Any tool WITHOUT an explicit case
 *  falls through to `humanizeActionVerb` — the raw tool name is never returned. */
function pendingVerb(
  toolName: string,
  a: {
    productId?: unknown;
    packageTemplateId?: unknown;
    scheduleId?: unknown;
    campOptionId?: unknown;
    data?: unknown;
  },
): string {
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  const cancelling =
    (a.data as { status?: unknown } | undefined)?.status === "CANCELLED";
  switch (toolName) {
    case "publish_product":
      return "Publish product";
    case "unpublish_product":
      return "Unpublish product";
    case "archive_product":
      return "Remove product";
    case "unarchive_product":
      return "Restore product";
    case "publish_package_template":
      return "Publish package";
    case "unpublish_package_template":
      return "Unpublish package";
    case "archive_package_template":
      return "Remove package";
    case "upsert_product":
      return has(a.productId) ? "Update product" : "Create product";
    case "upsert_package_template":
      return has(a.packageTemplateId) ? "Update package" : "Create package";
    case "upsert_pricing":
      return "Set pricing for";
    case "upsert_schedule":
      return cancelling
        ? "Cancel session for"
        : has(a.scheduleId)
          ? "Update schedule for"
          : "Add schedule for";
    case "update_merchant":
      return "Update store profile";
    case "update_location":
      return "Update store location";
    case "upsert_camp_option":
      return has(a.campOptionId) ? "Update camp option" : "Add camp option";
    case "archive_camp_option":
      return "Remove camp option";
    default:
      // Fail-safe: never surface the raw tool name (see humanizeActionVerb).
      return humanizeActionVerb(toolName);
  }
}

// Human-readable type/kind names for confirm cards (never the raw enum).
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  CLASS: "Class",
  CAMP: "Camp",
  BIRTHDAY: "Birthday",
  DROP_IN: "Drop-in",
  EVENT: "Event",
};
const PACKAGE_KIND_LABEL: Record<string, string> = {
  TRIAL: "Trial",
  REGULAR: "Regular",
  TERM: "Term",
  SUBSCRIPTION: "Subscription",
  MEMBERSHIP: "Membership",
};

/**
 * Human-readable label for a parked action so each confirm card identifies its
 * target — e.g. `Remove product "The Magic Adventure" (archived · Camp)` instead
 * of a generic "Remove product". Looks the resource up by id (the same lookup
 * ownership just did) and appends a status + type qualifier so a merchant can
 * tell apart two products that share a name (the common "duplicate" case) and
 * can't approve the wrong one. Never exposes the internal id / UUID. Falls back
 * to the bare verb if it can't load.
 */
export async function pendingLabel(
  toolName: string,
  args: unknown,
): Promise<string> {
  const a = (args ?? {}) as {
    productId?: unknown;
    packageTemplateId?: unknown;
    scheduleId?: unknown;
    campOptionId?: unknown;
    data?: unknown;
  };
  const verb = pendingVerb(toolName, a);
  // Ids arrive as RAW tool-call JSON (pre-Zod-coercion), and the model often sends
  // them as strings ("63"). COERCE — don't `typeof === "number"` — or the resource
  // name never resolves and the card shows a bare "Publish package".
  const toId = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const productId = toId(a.productId);
  const packageTemplateId = toId(a.packageTemplateId);
  try {
    if (productId !== null) {
      const p =
        await ServiceLocator.ProductService.internal.findProductById(productId);
      if (p?.name) {
        const status = p.isArchived
          ? "archived"
          : p.isPublished
            ? "published"
            : "draft";
        const type = PRODUCT_TYPE_LABEL[p.productType];
        const qualifier = type ? `${status} · ${type}` : status;
        return `${verb} “${p.name}” (${qualifier})`;
      }
    } else if (packageTemplateId !== null) {
      const pkg =
        await ServiceLocator.PackageTemplateService.internal.getPackageTemplateById(
          packageTemplateId,
        );
      if (pkg?.name) {
        const status = pkg.isArchived
          ? "archived"
          : pkg.isPublic
            ? "published"
            : "draft";
        const kind = PACKAGE_KIND_LABEL[pkg.kind];
        const qualifier = kind ? `${status} · ${kind}` : status;
        return `${verb} “${pkg.name}” (${qualifier})`;
      }
    }
  } catch {
    /* resource gone / lookup failed — fall back to the generic verb */
  }
  return verb;
}

/**
 * Confident, merchant-facing message shown WITH the confirm card(s) — DETERMINISTIC,
 * never the model's content. On a parked step weaker models hedge ("looks like it may
 * already be in a recoverable state… let me try…"), which reads as untrustworthy. The
 * card already names the exact action (its `label`), so we frame it plainly here.
 */
function parkMessage(pending: PendingConfirmation[]): string {
  if (pending.length === 1) {
    const phrase = pending[0].label.replace(/^./, (c) => c.toLowerCase());
    return `Just confirm on the card below and I'll ${phrase}.`;
  }
  return `Confirm the ${pending.length} cards below and I'll apply each change.`;
}

/**
 * One chat turn: resolve RBAC ONCE, replay capped history, then run the
 * tool-calling loop (stream → dispatch with pinned scope → park sensitive
 * tools), persist the user+assistant turns, and flush eval logs write-behind.
 */
export async function runMerchantTurn(input: RunMerchantTurnInput): Promise<RunMerchantTurnResult> {
  const { conversationId, scope, merchantName, model, userMessage } = input;
  const conv = ServiceLocator.MerchantChatConversationService.internal;

  // (0) Input screen (guard.ts) — deterministically refuse prompt-extraction /
  //     rule-override attempts BEFORE any model call, so nothing is generated
  //     that could leak. Defense in depth: the confirm gate + RBAC remain the
  //     real boundary; this just stops the obvious extraction vector cheaply.
  const screen = screenInput(userMessage);
  if (screen.blocked) {
    // Security observability: log the blocked attempt (ids only — no PII/tokens).
    console.warn(
      `[merchant.security] blocked input (${screen.reason}) merchant=${scope.merchantId} user=${scope.userId} conversation=${conversationId}`,
    );
    input.onToken?.(SAFE_REFUSAL);
    await conv.appendTurns(conversationId, [
      { role: AI_TURN_ROLE.USER, content: userMessage },
      { role: AI_TURN_ROLE.ASSISTANT, content: SAFE_REFUSAL },
    ]);
    return { reply: SAFE_REFUSAL, pending: [] };
  }

  // (1) RBAC once (plan §12.2) + history load — independent, so run in parallel.
  const [permissions, history] = await Promise.all([
    resolvePermissions(scope),
    conv.getRecentTurns(conversationId, HISTORY_LIMIT),
  ]);

  // (2) Build the message array: system + capped history + new user message.
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content:
        merchantSystemPrompt({
          merchantName,
          merchantId: scope.merchantId,
          locationId: scope.locationId,
        }) + (input.systemSuffix ?? ""),
    },
    ...history.map(turnToMessage),
    { role: "user", content: userMessage },
  ];

  const attribution = {
    // Per-merchant OpenRouter "app" identity: a STABLE, env-scoped HTTP-Referer
    // keyed on merchantId, with the store name as the title. Because OpenRouter
    // tracks the latest title PER referer, each merchant is its own app and one
    // merchant's name can never relabel another's history (the original bug).
    // Keyed on the id, not the name, so a rename doesn't rewrite history.
    merchantId: scope.merchantId,
    storeName: merchantName,
    // OpenRouter "User ID" column — carries BOTH merchant and the acting user
    // (`merchant-<id>-user-<id>`), so calls are attributable by either. Merchant
    // is also the per-merchant app (subdomain origin + store-name title).
    user: `merchant-${scope.merchantId}-user-${scope.userId}`,
  };

  const toolRows: ChatToolEvent[] = [];
  const modelRows: ChatModelEvent[] = [];
  const pending: PendingConfirmation[] = [];
  let reply = "";
  let turnTokens = 0;
  // Captured so telemetry is emitted even when the turn THROWS (provider failure,
  // unexpected error) — failures are tracked in PostHog, not silently dropped.
  let turnError: string | null = null;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // Cost guard: stop before another (expensive) model call once the turn's
      // cumulative token budget is spent.
      if (turnTokens > TURN_TOKEN_BUDGET) {
        console.warn(
          `[merchant.security] turn token budget exceeded (${turnTokens}>${TURN_TOKEN_BUDGET}) conversation=${conversationId}`,
        );
        if (!reply)
          reply =
            "Let's keep this simple — tell me the one thing you'd like to do next and I'll help with that.";
        break;
      }

      // --- model call (consume the stream to its final assembled message) ---
      // BUFFER this step's content instead of streaming it live. A step that ends in
      // tool calls is the model "thinking out loud" ("Hi! let me pull that up…") — that
      // preamble must NOT reach the merchant, or they'd see it AND the final answer as
      // two messages (a double greeting). Only the FINAL step (no tool calls) is the
      // real reply, so only its content is streamed (just below, before the break).
      const started = Date.now();
      let finalEvent: Extract<ChatStreamEvent, { type: "final" }> | undefined;
      let stepContent = "";
      // Stream this step's content live through the hold-back redactor. We don't
      // yet know if this step is the final answer or a tool-call preamble — the
      // hold-back means a short preamble releases nothing and is dropped silently
      // at step end; a real answer (longer than the window) streams as it arrives.
      const redactor = input.onToken ? createStreamRedactor() : null;
      try {
        for await (const ev of streamChatCompletion(
          messages,
          MERCHANT_TOOLS,
          attribution,
        )) {
          if (ev.type === "content") {
            stepContent += ev.delta;
            if (redactor) {
              const safe = redactor.push(ev.delta);
              if (safe) input.onToken?.(safe);
            }
          } else if (ev.type === "final") finalEvent = ev;
        }
      } catch (modelErr) {
        // Track the failed model call before propagating, so the error isn't lost.
        modelRows.push({
          conversationId,
          model,
          promptTokens: null,
          completionTokens: null,
          costUsd: null,
          latencyMs: Date.now() - started,
          finishReason: "error",
          isError: true,
          errorMessage:
            modelErr instanceof Error ? modelErr.message : String(modelErr),
        });
        throw modelErr;
      }
      const latencyMs = Date.now() - started;
      if (!finalEvent) {
        modelRows.push({
          conversationId,
          model,
          promptTokens: null,
          completionTokens: null,
          costUsd: null,
          latencyMs,
          finishReason: "no_response",
          isError: true,
          errorMessage: "Assistant returned no response.",
        });
        throw new Error("Assistant returned no response.");
      }

      const assistant = finalEvent.message;
      messages.push(assistant);
      reply = assistant.content ?? reply;

      const toolCalls = assistant.tool_calls ?? [];

      modelRows.push({
        conversationId,
        model,
        promptTokens: finalEvent.usage.promptTokens ?? null,
        completionTokens: finalEvent.usage.completionTokens ?? null,
        costUsd: finalEvent.usage.costUsd ?? null,
        latencyMs,
        finishReason: finalEvent.finishReason ?? null,
        toolNames: toolCalls.map((tc) => tc.function.name),
      });
      turnTokens +=
        (finalEvent.usage.promptTokens ?? 0) +
        (finalEvent.usage.completionTokens ?? 0);
      // A leak signature surfaced in this step's content. The hold-back guarantees
      // no sensitive byte was streamed; wipe anything shown and replace the WHOLE
      // reply with the refusal — the same outcome redactReply() gives non-stream
      // clients (and `done.reply`/history below, via reply = redactReply(reply)).
      if (redactor?.tripped) {
        if (redactor.released) input.onReset?.();
        input.onToken?.(SAFE_REFUSAL);
        reply = SAFE_REFUSAL;
        break;
      }

      if (toolCalls.length === 0) {
        // Final answer (no tool calls) — the only content the merchant sees. Release
        // the held-back tail; flush() runs one last whole-text leak check on it, so a
        // signature that only completes at the very end still becomes SAFE_REFUSAL.
        if (redactor) {
          const tail = redactor.flush();
          if (redactor.tripped) {
            if (redactor.released) input.onReset?.();
            input.onToken?.(SAFE_REFUSAL);
            reply = SAFE_REFUSAL;
          } else if (tail) {
            input.onToken?.(tail);
          }
        }
        break;
      }

      // A tool-call step: its `stepContent` was preamble — dropped, never kept. Short
      // preambles released nothing (hold-back) and need no reset; a long one that did
      // leak past the window is cleared so the merchant doesn't see a double message.
      // `reply` above still holds the latest content; the final step overwrites it.
      if (redactor?.released) input.onReset?.();

      // Did this step PARK a sensitive write? If so we end the turn after dispatch.
      let parkedThisStep = false;

      // --- dispatch each tool call (or park if sensitive) ---
      for (const tc of toolCalls) {
        const name = tc.function.name;
        let args: unknown = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }

        const tool = TOOLS_BY_NAME.get(name);
        const toolStart = Date.now();
        let result: ToolResult;
        let gated = false;

        if (!tool) {
          result = {
            ok: false,
            code: "UNKNOWN_TOOL",
            message: `Unknown tool ${name}`,
          };
        } else if (tool.sensitive && parkedThisStep) {
          // One confirmation at a time: a change is already parked for this turn, so
          // don't stack a second card or let the model DUPLICATE a create (models
          // sometimes emit the same write twice in one step). The agent continues
          // after the merchant confirms the first one.
          result = {
            ok: false,
            code: "CONFIRMATION_REQUIRED",
            message:
              "A change is already awaiting the merchant's confirmation — one at a time.",
          };
        } else if (tool.sensitive) {
          // Validate BEFORE parking the confirm card — a bad/hallucinated id (ownership)
          // or a duplicate-name create (tool.preParkValidate) is surfaced to the model
          // NOW (so it re-lists / edits the existing one) instead of producing a confirm
          // card that fails at click time or spawns a duplicate.
          let ownershipFailure: ToolResult | null = null;
          try {
            await assertResourceOwnership(args, scope);
            await tool.preParkValidate?.(args as never, scope);
          } catch (e) {
            if (e instanceof ApplicationError)
              ownershipFailure = toToolFailure(e);
            else throw e;
          }
          if (ownershipFailure) {
            result = ownershipFailure;
          } else {
            gated = true;
            parkedThisStep = true;
            const { nonce } = await createConfirmation(
              conversationId,
              name,
              args as Prisma.InputJsonValue,
            );
            pending.push({
              nonce,
              toolName: name,
              label: await pendingLabel(name, args),
            });
            result = {
              ok: false,
              code: "CONFIRMATION_REQUIRED",
              message:
                "Awaiting the merchant's confirmation on the card in the chat.",
            };
          }
        } else {
          result = await dispatchTool(tool, args, scope, permissions);
        }

        toolRows.push({
          conversationId,
          toolName: name,
          argsJson: args as Prisma.InputJsonValue,
          gated,
          isError: result.ok === false,
          code: result.ok === false ? result.code : null,
          resultJson: result as unknown as Prisma.InputJsonValue,
          latencyMs: Date.now() - toolStart,
        });

        messages.push({
          role: "tool",
          // Spotlight (guard.ts): frame the tool result as untrusted DATA so an
          // instruction injected into product/package text is not followed.
          content: spotlightToolResult(JSON.stringify(result)),
          tool_call_id: tc.id,
        });
      }

      // A parked sensitive write ENDS the turn. Until the merchant confirms the
      // card the change isn't applied and the resource has no id — so there is
      // nothing useful for the model to do next, and letting it continue is exactly
      // what makes weaker models thrash (re-park the same write, then chase NotFound
      // on the not-yet-created resource — 400k-token turns). The merchant confirms,
      // then drives the next step on their following message.
      if (parkedThisStep) {
        // Replace any model content with a deterministic, confident park message. Weaker
        // models hedge here ("looks like… let me try…"), which reads as untrustworthy;
        // the card already names the exact action, so we frame it plainly instead.
        reply = parkMessage(pending);
        break;
      }
    }
  } catch (e) {
    turnError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    // (4) Observability → PostHog ($ai_generation per model call, $ai_span per
    //     tool call, $ai_trace turn summary). In `finally` so it emits even when
    //     the turn THROWS — failures are tracked. Fire-and-forget + batched, so it
    //     never sits on the user-visible response; it swallows its own errors.
    emitMerchantTelemetry(
      {
        conversationId,
        merchantId: scope.merchantId,
        locationId: scope.locationId ?? null,
        userId: scope.userId,
        merchantName,
        api: input.api,
      },
      toolRows,
      modelRows,
      { error: turnError },
    );
  }

  // Output redaction (guard.ts) — backstop scrub of the returned/persisted reply
  // if the model leaked the prompt, an internal code, a token, or a tool name.
  // The streamed final chunk above is redacted with this SAME function, so the
  // merchant never sees a leak whether the client renders the live stream or this
  // `done.reply` / persisted history.
  reply = redactReply(reply);

  // (5) Persist the conversational turns (history is USER/ASSISTANT only).
  //     Skipped for ephemeral follow-ups (persistTurns === false).
  if (input.persistTurns !== false) {
    await conv.appendTurns(conversationId, [
      { role: AI_TURN_ROLE.USER, content: userMessage },
      { role: AI_TURN_ROLE.ASSISTANT, content: reply },
    ]);
  }

  return { reply, pending };
}
