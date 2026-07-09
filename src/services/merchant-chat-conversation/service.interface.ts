import {
  AI_PENDING_STATUS,
  AI_TURN_ROLE,
  AiConversation,
  AiPendingAction,
  AiTurn,
  Prisma,
} from "@prisma/client";

/**
 * DB-backed conversation + turn history + confirm-gate pending actions for the
 * AI agent. Internal-only — the agent layer (loop/gate) is the sole consumer.
 * DB-backed (not in-memory) so the server stays stateless / horizontally
 * scalable (rule 05) and every turn is replayable for evals.
 */

export type CreateAiConversationInput = {
  merchantId: number;
  // Optional: omitted for a merchant-scoped conversation (no active location).
  locationId?: number | null;
  userId: number;
  model: string;
  systemPromptHash: string;
};

export type AppendTurnInput = {
  role: AI_TURN_ROLE;
  content: string;
  toolCallId?: string | null;
  rawJson?: Prisma.InputJsonValue;
};

export type CreatePendingActionInput = {
  conversationId: number;
  toolName: string;
  argsJson: Prisma.InputJsonValue;
  expiresAt: Date;
};

export interface IMerchantChatConversationServiceInternal {
  createConversation(input: CreateAiConversationInput): Promise<AiConversation>;
  /** Throws NotFoundError.AiConversation when absent. */
  getConversationById(id: number): Promise<AiConversation>;
  /** Appends turns with contiguous sequence numbers; returns the new turn count. */
  appendTurns(conversationId: number, turns: AppendTurnInput[]): Promise<number>;
  /** Last `limit` turns, returned oldest→newest (history cap, rule §12.4). */
  getRecentTurns(conversationId: number, limit: number): Promise<AiTurn[]>;
  createPendingAction(input: CreatePendingActionInput): Promise<AiPendingAction>;
  /** Throws NotFoundError.AiPendingAction when absent. */
  getPendingByNonce(nonce: string): Promise<AiPendingAction>;
  resolvePendingAction(
    nonce: string,
    status: AI_PENDING_STATUS,
  ): Promise<AiPendingAction>;
}
