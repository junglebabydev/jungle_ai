import {
  Prisma,
  WHATSAPP_JOB_STATUS,
  WhatsappInboundJob,
} from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  EnqueueInboundInput,
  IWhatsappInboundJobServiceInternal,
} from "./service.interface";

async function enqueue(
  input: EnqueueInboundInput,
): Promise<{ enqueued: boolean }> {
  try {
    await prisma.whatsappInboundJob.create({
      data: {
        providerMessageId: input.providerMessageId,
        phoneE164: input.phoneE164,
        payload: input.payload,
      },
    });
    return { enqueued: true };
  } catch (e) {
    // Unique violation on providerMessageId = Meta redelivery. Not an error —
    // the job already exists; report it as a no-op so the webhook still ACKs 200.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { enqueued: false };
    }
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.WhatsappInboundJob;
  }
}

async function claimNext(): Promise<WhatsappInboundJob | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      // FOR UPDATE SKIP LOCKED: concurrent workers/replicas never grab the same
      // row. Prisma's query builder can't express SKIP LOCKED, so raw-select the
      // id then update through the typed client.
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "WhatsappInboundJob"
        WHERE "status" = 'PENDING'::"WHATSAPP_JOB_STATUS"
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return null;

      return tx.whatsappInboundJob.update({
        where: { id: rows[0].id },
        data: {
          status: WHATSAPP_JOB_STATUS.PROCESSING,
          lockedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.WhatsappInboundJob;
  }
}

async function markDone(id: number): Promise<void> {
  await prisma.whatsappInboundJob.update({
    where: { id },
    data: { status: WHATSAPP_JOB_STATUS.DONE, processedAt: new Date() },
  });
}

async function markFailed(id: number, error: string): Promise<void> {
  await prisma.whatsappInboundJob.update({
    where: { id },
    data: {
      status: WHATSAPP_JOB_STATUS.FAILED,
      processedAt: new Date(),
      error: error.slice(0, 2000),
    },
  });
}

async function reclaimStale(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await prisma.whatsappInboundJob.updateMany({
    where: {
      status: WHATSAPP_JOB_STATUS.PROCESSING,
      lockedAt: { lt: cutoff },
    },
    data: { status: WHATSAPP_JOB_STATUS.PENDING, lockedAt: null },
  });
  return res.count;
}

export const WhatsappInboundJobServiceInternal: IWhatsappInboundJobServiceInternal =
  {
    enqueue,
    claimNext,
    markDone,
    markFailed,
    reclaimStale,
  };
