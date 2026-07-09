import { WhatsappLink } from "@prisma/client";
import z from "zod";

/**
 * Contracts for the WhatsApp channel (Meta Cloud API).
 *
 * Two surfaces:
 *  1. The public webhook (`whatsappWebhookRouter`) — Meta's verify-handshake
 *     query and the inbound message payload. The payload schema is intentionally
 *     LENIENT (`.passthrough()`, everything optional): Meta evolves the shape and
 *     also delivers status callbacks on the same `messages` field, so we never
 *     want a schema mismatch to 500 a webhook (Meta would retry forever). We
 *     extract only what we need via `extractInboundMessages`.
 *  2. The authenticated link endpoint (`whatsappRouter`) — the merchant's request
 *     to bind their WhatsApp number, and the wa.me deep-link response.
 *
 * `merchantId` is in the link body so `requireMerchantOwner` + `requirePermission`
 * (which read `req.body`) can gate the request (same pattern as MerchantChatDTOs).
 */

// --- Webhook: GET verify handshake query ---
// Meta calls GET with hub.mode=subscribe&hub.verify_token=<our token>&hub.challenge=<echo>.
export const WhatsappVerifyQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional(),
});
export type WhatsappVerifyQueryDTO = z.infer<typeof WhatsappVerifyQuerySchema>;

// --- Webhook: inbound POST payload (lenient) ---
export const WhatsappWebhookSchema = z
  .object({
    object: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            changes: z
              .array(
                z
                  .object({
                    field: z.string().optional(),
                    value: z
                      .object({
                        messaging_product: z.string().optional(),
                        metadata: z.unknown().optional(),
                        contacts: z.array(z.unknown()).optional(),
                        // Actual user messages we act on.
                        messages: z.array(z.unknown()).optional(),
                        // Delivery/read receipts — present on the same field; ignored.
                        statuses: z.array(z.unknown()).optional(),
                      })
                      .passthrough()
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type WhatsappWebhookDTO = z.infer<typeof WhatsappWebhookSchema>;

/**
 * A single inbound message normalized down to what the turn-runner needs.
 * `kind` distinguishes a free-text message (→ runMerchantTurn) from an interactive
 * button reply (→ executeConfirmation). `buttonId` carries the confirm payload
 * we set when sending the Confirm/Cancel card.
 */
export type NormalizedInboundMessage = {
  providerMessageId: string;
  fromPhone: string; // E.164 without '+', as Meta delivers it
  kind: "text" | "button";
  text?: string;
  buttonId?: string;
};

/**
 * Pull the actionable user messages out of a Meta webhook payload. Ignores
 * status callbacks and any message type we don't handle. Pure — no I/O. Returns
 * [] for a payload that carries no user messages (the common status-only case).
 */
export function extractInboundMessages(
  payload: WhatsappWebhookDTO,
): NormalizedInboundMessage[] {
  const out: NormalizedInboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = (change.value?.messages ?? []) as Array<
        Record<string, unknown>
      >;
      for (const m of messages) {
        const id = typeof m.id === "string" ? m.id : undefined;
        const from = typeof m.from === "string" ? m.from : undefined;
        const type = typeof m.type === "string" ? m.type : undefined;
        if (!id || !from) continue;

        if (type === "text") {
          const body = (m.text as { body?: unknown } | undefined)?.body;
          if (typeof body === "string" && body.trim()) {
            out.push({
              providerMessageId: id,
              fromPhone: from,
              kind: "text",
              text: body.trim(),
            });
          }
        } else if (type === "interactive") {
          // Tappable replies arrive as either a button reply (Confirm/Cancel
          // cards) or a list reply (the suggestions "Options" list). Both carry
          // {id,title}; the id holds our wa_confirm:/wa_cancel:/wa_suggest: payload.
          const interactive = m.interactive as
            | {
                type?: string;
                button_reply?: { id?: unknown; title?: unknown };
                list_reply?: { id?: unknown; title?: unknown };
              }
            | undefined;
          const reply = interactive?.button_reply ?? interactive?.list_reply;
          if (reply && typeof reply.id === "string") {
            out.push({
              providerMessageId: id,
              fromPhone: from,
              kind: "button",
              buttonId: reply.id,
              text: typeof reply.title === "string" ? reply.title : undefined,
            });
          }
        } else if (type === "button") {
          // Quick-reply (template) button — payload in button.payload.
          const button = m.button as
            | { payload?: unknown; text?: unknown }
            | undefined;
          if (button && typeof button.payload === "string") {
            out.push({
              providerMessageId: id,
              fromPhone: from,
              kind: "button",
              buttonId: button.payload,
              text: typeof button.text === "string" ? button.text : undefined,
            });
          }
        }
        // Other types (image, audio, location, …) are intentionally dropped in v1.
      }
    }
  }
  return out;
}

/** Prefix the wa.me deep link pre-fills, so an inbound text is recognised as a
 *  link attempt by an as-yet-unbound phone. */
export const LINK_CODE_PREFIX = "LINK-";

/**
 * Extract a link code from an inbound text. Finds the `LINK-XXXX` token
 * ANYWHERE in the message (so the deep link can pre-fill a natural-sounding
 * sentence around it), or accepts a bare code. Returns null when there's no
 * code. Pure — used by the turn-runner before a phone is bound.
 */
export function parseLinkCode(text: string): string | null {
  const upper = text.trim().toUpperCase();
  // The LINK-<code> token, anywhere in the message.
  const m = upper.match(/LINK-([A-Z0-9]{6,16})/);
  if (m) return m[1];
  // Or the whole message is just a bare code.
  if (/^[A-Z0-9]{6,12}$/.test(upper)) return upper;
  return null;
}

// --- Authenticated: POST /whatsapp/link ---
export const WhatsappLinkSchema = z.object({
  merchantId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
});
export type WhatsappLinkDTO = z.infer<typeof WhatsappLinkSchema>;

export type WhatsappLinkResponseDTO = {
  /** The one-time code the merchant sends over WhatsApp. */
  code: string;
  /** wa.me deep link that opens WhatsApp with the code pre-filled. */
  deepLink: string;
  /** When the code stops working (ISO via Date). */
  expiresAt: Date;
};

// --- Authenticated: GET /merchants/:merchantId/whatsapp/status ---
export type WhatsappStatusResponseDTO = {
  connected: boolean;
  /** Last 4 digits of the bound number for display (PII-minimal). */
  phoneLast4?: string | null;
  /** Last inbound activity on the linked number. */
  lastActiveAt?: Date | null;
};

/** Project an active link (or null) to the dashboard status shape. Never exposes
 *  the full phone number — only the last 4 digits. */
export function mapWhatsappStatusDTO(
  link: WhatsappLink | null,
): WhatsappStatusResponseDTO {
  if (!link || !link.phoneE164) return { connected: false };
  return {
    connected: true,
    phoneLast4: link.phoneE164.slice(-4),
    lastActiveAt: link.lastInboundAt,
  };
}
