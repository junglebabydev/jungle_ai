import { processInboundJob } from "../ai/channels/whatsapp/merchant";
import { ServiceLocator } from "../services";
import { isWhatsappConfigured } from "../lib/whatsapp";
import ApplicationError from "../errors/ApplicationError";

/**
 * In-process WhatsApp inbound worker. Started from `src/index.ts` (NEVER from
 * buildApp() — tests build the app without a DB). Polls the Postgres queue and
 * drains it SERIALLY: one job at a time, so a double-tapped Confirm (two jobs,
 * two message ids) can never run executeConfirmation concurrently — the gate's
 * single-use check is safe. Across replicas, FOR UPDATE SKIP LOCKED keeps each
 * job to one worker.
 *
 * Retry: claimNext sets PROCESSING + increments attempts. On failure under the
 * cap the job is left PROCESSING and re-queued later by the visibility-timeout
 * reclaim; at the cap it's dead-lettered (FAILED).
 */

// The webhook wakes the worker on enqueue (wakeWhatsappWorker), so polling is
// only a fallback for missed wakes / other replicas — not in the reply path.
const POLL_MS = Number(process.env.WHATSAPP_WORKER_POLL_MS ?? 1000);
const RECLAIM_MS = 60_000; // sweep stuck PROCESSING jobs once a minute
const VISIBILITY_TIMEOUT_MS = 120_000; // a job processing >2m is considered stuck
const MAX_ATTEMPTS = 3;

let draining = false;
let rerun = false;

async function drainOnce(): Promise<void> {
  // Single-flight, but if a wake arrives mid-drain, remember it and sweep again
  // so a just-enqueued job isn't stranded until the next poll tick.
  if (draining) {
    rerun = true;
    return;
  }
  draining = true;
  const jobs = ServiceLocator.WhatsappInboundJobService.internal;
  try {
    do {
      rerun = false;
      for (;;) {
        const job = await jobs.claimNext();
        if (!job) break;
        try {
          await processInboundJob(job);
          await jobs.markDone(job.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(
            `[whatsapp.worker] job ${job.id} failed (attempt ${job.attempts}): ${msg}`,
          );
          // A failed SEND is non-retryable: the turn already ran, and the
          // recipient/Meta error (e.g. 131030 recipient-not-allowed) won't change
          // on a retry — dead-letter immediately instead of churning. Other
          // failures (DB / LLM / lookup) retry up to the cap, then reclaimStale
          // re-queues after the visibility timeout.
          const isSendFailure =
            e instanceof ApplicationError && e.status === "BR_177";
          if (isSendFailure || job.attempts >= MAX_ATTEMPTS) {
            await jobs.markFailed(job.id, msg);
          }
        }
      }
    } while (rerun);
  } catch (e) {
    console.error("[whatsapp.worker] drain error:", e);
  } finally {
    draining = false;
  }
}

/**
 * Wake the worker NOW (called by the webhook right after it enqueues) so a new
 * message is processed without waiting for the next poll tick — removes up to
 * POLL_MS of latency. Fire-and-forget; polling remains the fallback (and covers
 * other replicas, which this in-process wake can't reach).
 */
export function wakeWhatsappWorker(): void {
  void drainOnce();
}

/** Start the worker timers. No-op (with a warning) when WhatsApp isn't configured. */
export function startWhatsappWorker(): void {
  if (!isWhatsappConfigured()) {
    console.warn(
      "[whatsapp.worker] not started — WhatsApp env not fully configured.",
    );
    return;
  }

  const pollTimer = setInterval(() => {
    void drainOnce();
  }, POLL_MS);
  pollTimer.unref();

  const reclaimTimer = setInterval(() => {
    ServiceLocator.WhatsappInboundJobService.internal
      .reclaimStale(VISIBILITY_TIMEOUT_MS)
      .then((n) => {
        if (n > 0) console.log(`[whatsapp.worker] reclaimed ${n} stuck job(s)`);
      })
      .catch((e) => console.error("[whatsapp.worker] reclaim failed:", e));
  }, RECLAIM_MS);
  reclaimTimer.unref();

  console.log(`⚡️[whatsapp.worker]: polling every ${POLL_MS}ms`);
}
