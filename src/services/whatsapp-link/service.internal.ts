import { Prisma, WHATSAPP_LINK_STATUS, WhatsappLink } from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CreatePendingLinkInput,
  IWhatsappLinkServiceInternal,
} from "./service.interface";
import { SecurityUtils } from "../../utils/securityUtils";

// The link code is a short-lived bearer secret. Store only its SHA-256 hash at
// rest (same pattern as auth tokens) so a DB read can't yield a usable code; the
// plaintext lives only in the wa.me deep link sent to the merchant.
function hashLinkCode(code: string): string {
  return SecurityUtils.generateHash(code);
}

async function findActiveByPhone(
  phoneE164: string,
): Promise<WhatsappLink | null> {
  return prisma.whatsappLink.findFirst({
    where: { phoneE164, status: WHATSAPP_LINK_STATUS.ACTIVE },
  });
}

async function findActiveByUserMerchant(
  userId: number,
  merchantId: number,
): Promise<WhatsappLink | null> {
  return prisma.whatsappLink.findFirst({
    where: { userId, merchantId, status: WHATSAPP_LINK_STATUS.ACTIVE },
  });
}

async function upsertPendingLink(
  input: CreatePendingLinkInput,
  tx?: Prisma.TransactionClient,
): Promise<WhatsappLink> {
  const db = tx ?? prisma;
  try {
    // Idempotent per (user, merchant, location) scope. A merchant clicking
    // "Connect" repeatedly must NOT spawn unbounded PENDING rows / live codes:
    // reuse the existing pending row for this scope and regenerate its code in
    // place (which invalidates the previous code — only the latest is valid).
    const existing = await db.whatsappLink.findFirst({
      where: {
        userId: input.userId,
        merchantId: input.merchantId,
        locationId: input.locationId ?? null,
        status: WHATSAPP_LINK_STATUS.PENDING,
      },
    });

    if (existing) {
      return await db.whatsappLink.update({
        where: { id: existing.id },
        data: {
          linkCode: hashLinkCode(input.linkCode),
          codeExpiresAt: input.codeExpiresAt,
        },
      });
    }

    return await db.whatsappLink.create({
      data: {
        merchantId: input.merchantId,
        locationId: input.locationId ?? null,
        userId: input.userId,
        status: WHATSAPP_LINK_STATUS.PENDING,
        linkCode: hashLinkCode(input.linkCode),
        codeExpiresAt: input.codeExpiresAt,
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateWhatsappLink;
  }
}

async function redeemCode(
  linkCode: string,
  phoneE164: string,
): Promise<WhatsappLink | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const pending = await tx.whatsappLink.findUnique({
        where: { linkCode: hashLinkCode(linkCode) },
      });
      if (
        !pending ||
        pending.status !== WHATSAPP_LINK_STATUS.PENDING ||
        !pending.codeExpiresAt ||
        pending.codeExpiresAt.getTime() < Date.now()
      ) {
        return null;
      }

      // v1 constraint: a phone maps to exactly one scope. Free any prior ACTIVE
      // binding for this phone before activating the new one (phoneE164 unique).
      const prior = await tx.whatsappLink.findFirst({
        where: { phoneE164, status: WHATSAPP_LINK_STATUS.ACTIVE },
      });
      if (prior && prior.id !== pending.id) {
        await tx.whatsappLink.update({
          where: { id: prior.id },
          data: { status: WHATSAPP_LINK_STATUS.REVOKED, phoneE164: null },
        });
      }

      // Symmetric constraint: one ACTIVE phone per (user, merchant) scope. When a
      // NEW number binds for a scope that already has one (i.e. "update number"
      // without an explicit disconnect), revoke the old number so status stays
      // unambiguous and the old phone stops being treated as connected.
      await tx.whatsappLink.updateMany({
        where: {
          userId: pending.userId,
          merchantId: pending.merchantId,
          status: WHATSAPP_LINK_STATUS.ACTIVE,
          id: { not: pending.id },
        },
        data: { status: WHATSAPP_LINK_STATUS.REVOKED, phoneE164: null },
      });

      return tx.whatsappLink.update({
        where: { id: pending.id },
        data: {
          phoneE164,
          status: WHATSAPP_LINK_STATUS.ACTIVE,
          linkCode: null,
          codeExpiresAt: null,
          lastInboundAt: new Date(),
        },
      });
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.RedeemWhatsappLink;
  }
}

async function revokeActiveByUserMerchant(
  userId: number,
  merchantId: number,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const db = tx ?? prisma;
  try {
    const { count } = await db.whatsappLink.updateMany({
      where: { userId, merchantId, status: WHATSAPP_LINK_STATUS.ACTIVE },
      data: { status: WHATSAPP_LINK_STATUS.REVOKED, phoneE164: null },
    });
    return count;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.DisconnectWhatsappLink;
  }
}

async function setActiveConversation(
  linkId: number,
  conversationId: number,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  await db.whatsappLink.update({
    where: { id: linkId },
    data: { activeConversationId: conversationId, lastInboundAt: new Date() },
  });
}

async function touchInbound(
  linkId: number,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  await db.whatsappLink.update({
    where: { id: linkId },
    data: { lastInboundAt: new Date() },
  });
}

async function clearActiveConversation(
  linkId: number,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  await db.whatsappLink.update({
    where: { id: linkId },
    data: { activeConversationId: null },
  });
}

export const WhatsappLinkServiceInternal: IWhatsappLinkServiceInternal = {
  findActiveByPhone,
  findActiveByUserMerchant,
  revokeActiveByUserMerchant,
  upsertPendingLink,
  redeemCode,
  setActiveConversation,
  touchInbound,
  clearActiveConversation,
};
