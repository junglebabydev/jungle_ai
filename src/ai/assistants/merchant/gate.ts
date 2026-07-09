import { AI_PENDING_STATUS, AI_TURN_ROLE, Prisma } from "@prisma/client";
import { resolvePermissions } from "../../../auth/permission-resolver";
import { ServiceLocator } from "../../../services";
import { dispatchTool } from "./dispatch";
import { ToolResult } from "./errors";
import { emitMerchantTelemetry } from "../../shared/evalLog";
import { MerchantScope } from "./tools/types";
import { TOOLS_BY_NAME } from "./tools/registry";

/**
 * Sensitive-tool confirm gate, SERVER-authoritative (plan §7). The model never
 * executes a sensitive tool (publish/unpublish/archive/unarchive): the loop
 * parks it as an `AiPendingAction`; the UI shows a Confirm/Cancel card; only an
 * explicit `/ai/confirm` click executes it. State is DB-backed (rule 05) and
 * auditable.
 */

const CONFIRM_TTL_MS = 15 * 60 * 1000;

/** Park a sensitive tool call for human confirmation; returns its nonce. */
export async function createConfirmation(
  conversationId: number,
  toolName: string,
  args: Prisma.InputJsonValue,
): Promise<{ nonce: string }> {
  const pending =
    await ServiceLocator.MerchantChatConversationService.internal.createPendingAction({
      conversationId,
      toolName,
      argsJson: args,
      expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
    });
  return { nonce: pending.nonce };
}

/** Best-effort resource name for a confirmation note — checks the result DTO and
 *  the tool args (some tools return a type-specific details DTO without a top-level
 *  name, but the args reliably carry the name the merchant gave). Merchant-safe. */
function resourceName(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.name === "string" && o.name.trim()) return o.name;
  for (const key of ["product", "data"]) {
    const inner = o[key];
    if (inner && typeof inner === "object") {
      const n = (inner as Record<string, unknown>).name;
      if (typeof n === "string" && n.trim()) return n;
    }
  }
  return null;
}

export type ConfirmOutcome =
  | { status: "confirmed"; result: ToolResult }
  | { status: "declined" }
  | { status: "expired" }
  | { status: "already_resolved" };

/**
 * Execute (or decline) a parked action after the human clicks Confirm/Cancel.
 * Re-derives scope from the conversation and re-checks RBAC/ownership exactly
 * like the loop — the model's intent never re-enters here.
 */
export async function executeConfirmation(
  nonce: string,
  approve: boolean,
): Promise<ConfirmOutcome> {
  const svc = ServiceLocator.MerchantChatConversationService.internal;
  const pending = await svc.getPendingByNonce(nonce);

  if (pending.status !== AI_PENDING_STATUS.PENDING) {
    return { status: "already_resolved" };
  }
  if (pending.expiresAt.getTime() < Date.now()) {
    await svc.resolvePendingAction(nonce, AI_PENDING_STATUS.EXPIRED);
    return { status: "expired" };
  }
  if (!approve) {
    await svc.resolvePendingAction(nonce, AI_PENDING_STATUS.DECLINED);
    return { status: "declined" };
  }

  const convo = await svc.getConversationById(pending.conversationId);
  const scope: MerchantScope = {
    merchantId: convo.merchantId,
    locationId: convo.locationId,
    userId: convo.userId,
  };
  const permissions = await resolvePermissions(scope);

  const tool = TOOLS_BY_NAME.get(pending.toolName);
  const started = Date.now();
  const result: ToolResult = tool
    ? await dispatchTool(tool, pending.argsJson, scope, permissions)
    : {
        ok: false,
        code: "UNKNOWN_TOOL",
        message: `Unknown tool ${pending.toolName}`,
      };

  await svc.resolvePendingAction(nonce, AI_PENDING_STATUS.CONFIRMED);

  // Telemetry: the confirmed sensitive tool is the real WRITE — track it as a
  // $ai_span (gated + confirmed) on the conversation's trace, with error state.
  emitMerchantTelemetry(
    {
      conversationId: pending.conversationId,
      merchantId: convo.merchantId,
      locationId: convo.locationId ?? null,
      userId: convo.userId,
      api: "POST /api/v1/ai/confirm",
    },
    [
      {
        conversationId: pending.conversationId,
        toolName: pending.toolName,
        argsJson: pending.argsJson,
        gated: true,
        confirmed: true,
        isError: result.ok === false,
        code: result.ok === false ? result.code : null,
        resultJson: result,
        latencyMs: Date.now() - started,
      },
    ],
    [],
  );

  // Record the applied change in the conversation so the NEXT turn's agent KNOWS it
  // happened — the conversation is the agent's only memory, and without this it
  // re-does an action the merchant already confirmed (re-creating, then thrashing
  // to reconcile the duplicate). Best-effort: a history-write failure must never
  // fail the confirm. Merchant-safe text only (no ids / codes); the agent re-reads
  // for ids when it needs them for the next step.
  if (result.ok === true) {
    // Record a SPECIFIC confirmation (action + resource name) so the NEXT turn's
    // agent knows exactly what was applied. A generic "done" made it lose track in
    // long conversations and reconcile out loud ("the confirmation was for X…") —
    // and on a create, re-create it. Pull the name from the result OR the args
    // (args reliably carry it; some tools return a details DTO without a top-level
    // name). Merchant-safe: name only, never ids/codes.
    const name = resourceName(result.data) ?? resourceName(pending.argsJson);
    const verb = pending.toolName.startsWith("publish_")
      ? "Published"
      : pending.toolName.startsWith("unpublish_")
        ? "Unpublished"
        : pending.toolName.startsWith("archive_")
          ? "Removed"
          : pending.toolName.startsWith("unarchive_")
            ? "Restored"
            : pending.toolName.startsWith("update_")
              ? "Updated"
              : "Saved";
    const note = name
      ? `✓ Done — ${verb} **${name}**.`
      : "✓ Done — that change has been applied and saved.";
    try {
      await svc.appendTurns(pending.conversationId, [
        { role: AI_TURN_ROLE.ASSISTANT, content: note },
      ]);
    } catch (e) {
      console.error(
        "[ai/confirm] could not record the confirmed change in history:",
        e,
      );
    }
  }

  return { status: "confirmed", result };
}
