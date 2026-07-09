import {
  EnqueueInboundInput,
  IWhatsappInboundJobService,
} from "./service.interface";
import { WhatsappInboundJobServiceInternal } from "./service.internal";

/**
 * Public surface for the inbound queue — the webhook router enqueues here.
 * Claiming/processing is internal-only (the worker), so the public slice is the
 * single idempotent enqueue.
 */
async function enqueue(
  input: EnqueueInboundInput,
): Promise<{ enqueued: boolean }> {
  return WhatsappInboundJobServiceInternal.enqueue(input);
}

export const WhatsappInboundJobService: IWhatsappInboundJobService = {
  enqueue,
};
