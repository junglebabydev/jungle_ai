import { AI_TURN_ROLE, ConciergeConversation, ConciergeTurn } from "@prisma/client";

/**
 * DB-backed conversation + turn history for the PUBLIC concierge (parent-facing
 * discovery chat). Internal-only — the concierge agent loop is the sole consumer.
 *
 * Unlike the merchant `AiConversation`, a concierge conversation has NO tenant
 * and NO user: it is anonymous. The unguessable `conciergeConversationID` uuid is
 * the client's capability handle (stored in the browser, resent to resume) — all
 * lookups go through it, never the enumerable numeric `id`.
 */

export type AppendConciergeTurnInput = {
  role: AI_TURN_ROLE;
  content: string;
};

export interface IConciergeConversationServiceInternal {
  /** Start a fresh anonymous conversation; the model id is recorded for replay. */
  createConversation(model: string): Promise<ConciergeConversation>;
  /** Resume by the public uuid handle. Throws NotFoundError.ConciergeConversation. */
  getConversationByPublicId(publicId: string): Promise<ConciergeConversation>;
  /** Append turns with contiguous sequence numbers; returns the new turn count. */
  appendTurns(
    conversationId: number,
    turns: AppendConciergeTurnInput[],
  ): Promise<number>;
  /** Last `limit` turns, oldest→newest (history cap). */
  getRecentTurns(conversationId: number, limit: number): Promise<ConciergeTurn[]>;
}
