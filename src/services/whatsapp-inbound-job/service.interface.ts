import { Prisma, WhatsappInboundJob } from "@prisma/client";

/**
 * Postgres-backed inbound queue for the WhatsApp webhook. The webhook validates
 * + enqueues + ACKs Meta in <5s; the worker claims jobs with SELECT … FOR UPDATE
 * SKIP LOCKED (safe across replicas) and processes them out-of-band. Dedupe is on
 * the unique providerMessageId, so Meta redeliveries are no-ops.
 */

export type EnqueueInboundInput = {
  providerMessageId: string;
  phoneE164: string;
  payload: Prisma.InputJsonValue;
};

export interface IWhatsappInboundJobService {
  /** Idempotent enqueue. Returns { enqueued: false } when the message id is a dup. */
  enqueue(input: EnqueueInboundInput): Promise<{ enqueued: boolean }>;
}

export interface IWhatsappInboundJobServiceInternal {
  enqueue(input: EnqueueInboundInput): Promise<{ enqueued: boolean }>;
  /** Atomically claim the oldest PENDING job (FOR UPDATE SKIP LOCKED). */
  claimNext(): Promise<WhatsappInboundJob | null>;
  markDone(id: number): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
  /** Reset PROCESSING jobs stuck past the visibility timeout back to PENDING. */
  reclaimStale(olderThanMs: number): Promise<number>;
}
