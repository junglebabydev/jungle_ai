import { randomInt } from "node:crypto";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { getBotDisplayNumber } from "../../lib/whatsapp";
import {
  LINK_CODE_PREFIX,
  mapWhatsappStatusDTO,
  WhatsappLinkDTO,
  WhatsappLinkResponseDTO,
  WhatsappStatusResponseDTO,
} from "../../shared/dtos/WhatsappDTOs";
import { IWhatsappLinkService } from "./service.interface";
import { WhatsappLinkServiceInternal } from "./service.internal";

/** Code TTL — the wa.me deep link pre-fills it, so a short window is fine. */
const CODE_TTL_MS = 15 * 60 * 1000;
/** Unambiguous alphabet (no 0/O/1/I) — high entropy, human-typeable as fallback. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function createLink(
  userId: number,
  dto: WhatsappLinkDTO,
): Promise<WhatsappLinkResponseDTO> {
  try {
    const code = generateCode();
    const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);

    await WhatsappLinkServiceInternal.upsertPendingLink({
      merchantId: dto.merchantId,
      locationId: dto.locationId ?? null,
      userId,
      linkCode: code,
      codeExpiresAt,
    });

    const botNumber = await getBotDisplayNumber();
    // Reads like a real first message the merchant would send — the LINK-<code>
    // token is what the server matches; the rest is natural language so it
    // doesn't look like a bare machine code in the chat.
    const prefilled = `Hi, I'd like to connect my account and manage it here on WhatsApp. ${LINK_CODE_PREFIX}${code}`;
    const deepLink = `https://wa.me/${botNumber}?text=${encodeURIComponent(
      prefilled,
    )}`;

    return { code, deepLink, expiresAt: codeExpiresAt };
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateWhatsappLink;
  }
}

async function getLinkStatus(
  userId: number,
  merchantId: number,
): Promise<WhatsappStatusResponseDTO> {
  try {
    const link = await WhatsappLinkServiceInternal.findActiveByUserMerchant(
      userId,
      merchantId,
    );
    return mapWhatsappStatusDTO(link);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchWhatsappLink;
  }
}

async function disconnect(
  userId: number,
  merchantId: number,
): Promise<WhatsappStatusResponseDTO> {
  try {
    await WhatsappLinkServiceInternal.revokeActiveByUserMerchant(
      userId,
      merchantId,
    );
    // Idempotent: post-disconnect the user is not connected for this merchant,
    // regardless of whether a binding existed. Mirrors the status shape so the
    // dashboard can render the new state directly.
    return mapWhatsappStatusDTO(null);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.DisconnectWhatsappLink;
  }
}

export const WhatsappLinkService: IWhatsappLinkService = {
  createLink,
  getLinkStatus,
  disconnect,
};
