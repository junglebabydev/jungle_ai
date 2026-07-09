import { Prisma, WhatsappLink } from "@prisma/client";
import {
  WhatsappLinkDTO,
  WhatsappLinkResponseDTO,
  WhatsappStatusResponseDTO,
} from "../../shared/dtos/WhatsappDTOs";

/**
 * Binds a verified WhatsApp phone number to a user + merchant/location scope.
 * Public surface = the dashboard "link my number" flow (returns a wa.me deep
 * link). Internal surface = the raw lookups/writes the WhatsApp turn-runner and
 * worker use to resolve scope and manage conversation continuity (they need the
 * raw row's scalar ids, not a DTO — same reason ownership middleware uses
 * internal slices).
 */

export type CreatePendingLinkInput = {
  merchantId: number;
  locationId?: number | null;
  userId: number;
  linkCode: string;
  codeExpiresAt: Date;
};

export interface IWhatsappLinkService {
  /** Issue a one-time link code for the signed-in user + verified merchant scope. */
  createLink(
    userId: number,
    dto: WhatsappLinkDTO,
  ): Promise<WhatsappLinkResponseDTO>;
  /** Is this user's WhatsApp connected for this merchant? (dashboard status) */
  getLinkStatus(
    userId: number,
    merchantId: number,
  ): Promise<WhatsappStatusResponseDTO>;
  /**
   * Disconnect (revoke) this user's active WhatsApp binding for the merchant.
   * Idempotent — returns the resulting status (`{ connected: false }`) whether or
   * not a binding existed. To CHANGE the number, disconnect then re-link.
   */
  disconnect(
    userId: number,
    merchantId: number,
  ): Promise<WhatsappStatusResponseDTO>;
}

export interface IWhatsappLinkServiceInternal {
  /** The current ACTIVE binding for a phone, or null. */
  findActiveByPhone(phoneE164: string): Promise<WhatsappLink | null>;
  /** The current ACTIVE binding for a user within a merchant, or null. */
  findActiveByUserMerchant(
    userId: number,
    merchantId: number,
  ): Promise<WhatsappLink | null>;
  /**
   * Revoke ALL active bindings for a (user, merchant) scope (clears the phone).
   * Returns how many rows were revoked. Used by disconnect, and to keep one
   * ACTIVE phone per scope when a new number binds.
   */
  revokeActiveByUserMerchant(
    userId: number,
    merchantId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
  /**
   * Create or refresh the single PENDING link for a (user, merchant, location)
   * scope. Idempotent: repeated "Connect" clicks reuse the same row and
   * regenerate its code in place (invalidating the previous code), so a user can
   * never spawn unbounded PENDING rows / live codes.
   */
  upsertPendingLink(
    input: CreatePendingLinkInput,
    tx?: Prisma.TransactionClient,
  ): Promise<WhatsappLink>;
  /**
   * Redeem a pending code for a phone → returns the now-ACTIVE link, or null if
   * the code is unknown/expired/already used. Single-domain transactional: also
   * revokes any prior ACTIVE binding for that phone (v1: one phone → one scope).
   */
  redeemCode(linkCode: string, phoneE164: string): Promise<WhatsappLink | null>;
  /** Pin the in-flight conversation for a phone's link + stamp inbound activity. */
  setActiveConversation(
    linkId: number,
    conversationId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /** Stamp inbound activity (idle-reuse window) without changing the conversation. */
  touchInbound(linkId: number, tx?: Prisma.TransactionClient): Promise<void>;
  /** Drop the pinned conversation so the next message starts fresh ("reset"). */
  clearActiveConversation(
    linkId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
