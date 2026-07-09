import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestError } from "../errors/domains/BadRequestError";
import { basePostHogProps, getPostHog } from "./posthog";

/**
 * Thin wrapper over the Meta WhatsApp Cloud API (Graph API). Mirrors
 * `src/lib/stripe.ts`: config is read lazily so the app boots even when
 * WhatsApp isn't configured yet, and `validateWhatsappConfig()` warns (not
 * crashes) at boot.
 *
 * Env (the only 4 vars this feature adds):
 *  - WHATSAPP_PHONE_NUMBER_ID  — sender id in the Graph API URL
 *  - WHATSAPP_ACCESS_TOKEN     — Bearer token for send calls
 *  - WHATSAPP_APP_SECRET       — verifies X-Hub-Signature-256 on inbound
 *  - WHATSAPP_VERIFY_TOKEN     — echoed back on the GET verify handshake
 *
 * The Graph API version is a hardcoded constant (NOT an env var) — bump it here.
 */

const GRAPH_API_VERSION = "v21.0";
/** WhatsApp text message body hard limit. Longer replies are chunked. */
const MAX_TEXT_LEN = 4096;

// ───────────────────────── Send-error classification ─────────────────────────
// The ONE place to map a Meta error code → how we treat it. Adding a new code is
// a single `case`; its `category` flows into logs, the PostHog `whatsapp_send_failed`
// event, and a dead-lettered job's `error`. Co-located here since it's only used
// by the send path below.
// Meta ref: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

export type WhatsappErrorCategory =
  | "recipient_not_allowed" // 131030 — recipient not on the test allowlist
  | "re_engagement_required" // 131047 — outside the 24h customer-service window
  | "undeliverable" // 131026 — message undeliverable
  | "unsupported_type" // 131051 — unsupported message type
  | "invalid_recipient" // 131008/131009/133010 — bad / unregistered number
  | "rate_limited" // 130429/131056/80007 — throttled
  | "auth" // 190/0 — token expired / invalid
  | "invalid_request" // 100 — malformed parameter
  | "transient" // 1/2/131000 — temporary Meta / internal
  | "unknown";

export type WhatsappErrorInfo = {
  code: number | null;
  category: WhatsappErrorCategory;
  /** Could a retry plausibly succeed WITHOUT a config/code/recipient change? */
  retryable: boolean;
  /** Short human summary for logs and the job's `error` column. */
  reason: string;
};

/** Map a Meta error code (+ HTTP status fallback) to its handling. Pure — callers
 *  do the logging/telemetry. Extend the switch to add behavior for a new code. */
export function classifyWhatsappSendError(
  metaCode: number | null,
  httpStatus: number,
  metaMessage = "",
): WhatsappErrorInfo {
  const make = (
    category: WhatsappErrorCategory,
    retryable: boolean,
  ): WhatsappErrorInfo => ({
    code: metaCode,
    category,
    retryable,
    reason: `(${metaCode ?? httpStatus}) ${metaMessage || category}`,
  });

  switch (metaCode) {
    case 131030:
      return make("recipient_not_allowed", false);
    case 131047:
      return make("re_engagement_required", false);
    case 131026:
      return make("undeliverable", false);
    case 131051:
      return make("unsupported_type", false);
    case 131008:
    case 131009:
    case 133010:
      return make("invalid_recipient", false);
    case 130429:
    case 131056:
    case 80007:
      return make("rate_limited", true);
    case 190:
    case 0:
      return make("auth", false);
    case 100:
      return make("invalid_request", false);
    case 1:
    case 2:
    case 131000:
      return make("transient", true);
    default:
      // Unmapped: fall back on the HTTP status — 5xx/429 are worth one retry.
      return make("unknown", httpStatus >= 500 || httpStatus === 429);
  }
}

export function getWhatsappVerifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN;
}

/** Run at app boot. Warns on missing config; never crashes the process. */
export function validateWhatsappConfig(): void {
  const missing = [
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(
      `[whatsapp] not fully configured (missing: ${missing.join(
        ", ",
      )}); the WhatsApp channel will be inert until these are set.`,
    );
  } else {
    console.log("[whatsapp] Cloud API configured.");
  }
}

/** True when all 4 env vars are present — used to short-circuit the worker. */
export function isWhatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN,
  );
}

/**
 * Verify Meta's `X-Hub-Signature-256: sha256=<hex>` over the RAW request body.
 * Constant-time compare. Returns false (never throws) on any malformed input so
 * the caller can answer a clean 403. Requires WHATSAPP_APP_SECRET.
 */
export function verifyWhatsappSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * The bot's own display phone number (digits only), needed for the wa.me deep
 * link. It is NOT the phone-number-id and isn't an env var, so we fetch it once
 * from the Graph API and cache it in-process. Falls back to the phone-number-id
 * only if the lookup fails (degraded deep link, still functional code).
 */
let _botNumberCache: string | null = null;
export async function getBotDisplayNumber(): Promise<string> {
  if (_botNumberCache) return _botNumberCache;

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) throw BadRequestError.WhatsappConfigMissing;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const json = (await res.json()) as { display_phone_number?: string };
      const digits = (json.display_phone_number ?? "").replace(/\D/g, "");
      if (digits) {
        _botNumberCache = digits;
        return digits;
      }
    }
  } catch (e) {
    console.error("[whatsapp] could not fetch display phone number:", e);
  }
  // Degraded fallback — the code still works; only the pre-filled wa.me number is off.
  return phoneNumberId;
}

function endpoint(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw BadRequestError.WhatsappConfigMissing;
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

/** Max attempts for a SEND at the HTTP level — only transient/retryable errors
 *  (per the classifier) get a second try; permanent ones (e.g. recipient not
 *  allowed) fail fast. This is send-level retry, NOT job-level (so it never
 *  re-runs an already-committed agent turn). */
const MAX_SEND_ATTEMPTS = 2;

/** Fire-and-forget observability for a send failure, keyed by the classifier's
 *  category so it's filterable/alertable in PostHog. Never throws. */
function reportSendFailure(info: WhatsappErrorInfo, httpStatus: number): void {
  const client = getPostHog();
  if (!client) return;
  try {
    client.capture({
      distinctId: "whatsapp-system",
      event: "whatsapp_send_failed",
      properties: {
        ...basePostHogProps(),
        source: "whatsapp.send",
        category: info.category,
        code: info.code,
        httpStatus,
        retryable: info.retryable,
      },
    });
  } catch {
    /* observability must never break the send path */
  }
}

async function postMessage(payload: Record<string, unknown>): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw BadRequestError.WhatsappConfigMissing;
  const url = endpoint();
  const body = JSON.stringify({ messaging_product: "whatsapp", ...payload });

  let lastInfo: WhatsappErrorInfo | null = null;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) return;

    // Parse Meta's error envelope { error: { code, message } } and classify it.
    const raw = await res.text().catch(() => "");
    let metaCode: number | null = null;
    let metaMessage = "";
    try {
      const err = JSON.parse(raw)?.error;
      metaCode = typeof err?.code === "number" ? err.code : null;
      metaMessage = typeof err?.message === "string" ? err.message : "";
    } catch {
      /* non-JSON body — fall back to HTTP status in the classifier */
    }
    const info = classifyWhatsappSendError(metaCode, res.status, metaMessage);
    lastInfo = info;
    // Provider detail stays server-side (never surfaced to the merchant).
    console.error(
      `[whatsapp.send] failed category=${info.category} code=${info.code} status=${res.status} retryable=${info.retryable} :: ${raw.slice(0, 300)}`,
    );
    reportSendFailure(info, res.status);

    if (!info.retryable || attempt === MAX_SEND_ATTEMPTS) break;
    await new Promise((r) => setTimeout(r, 800 * attempt)); // brief backoff
  }

  throw BadRequestError.WhatsappSend(lastInfo?.reason);
}

/**
 * Mark an inbound message as read (blue ticks) and optionally show a typing
 * indicator while we prepare the reply. The indicator auto-dismisses when we
 * send the reply or after 25s. Best-effort — a read/typing failure must NEVER
 * fail the turn, so this swallows all errors. Only call when we WILL respond.
 */
export async function markRead(
  messageId: string,
  typing = false,
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId || !messageId) return;
  try {
    await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          ...(typing ? { typing_indicator: { type: "text" } } : {}),
        }),
      },
    );
  } catch (e) {
    console.error("[whatsapp] mark-read/typing failed:", e);
  }
}

/** Send a plain text message, chunked at the 4096-char limit. */
export async function sendText(toPhone: string, body: string): Promise<void> {
  const text = body && body.trim() ? body : "…";
  for (let i = 0; i < text.length; i += MAX_TEXT_LEN) {
    const chunk = text.slice(i, i + MAX_TEXT_LEN);
    await postMessage({
      to: toPhone,
      type: "text",
      text: { preview_url: false, body: chunk },
    });
  }
}

/**
 * Send an approved Meta template message. Templates are *business-initiated*, so
 * they work outside the 24h customer-service window (unlike sendText / sendList /
 * sendButtons). `bodyParams` fill the template body's {{1}}, {{2}}… variables in
 * order.
 *
 * TEST-MODE SAFETY (fail-closed): a REAL number is used ONLY when
 * NOTIFICATION_TEST_MODE=off is explicitly set. Otherwise every template goes to
 * NOTIFICATION_TEST_WHATSAPP; if that's unset while in test mode, nothing is sent
 * — so a real merchant can never be messaged by accident. The guard is on the
 * template path only, so it never affects the AI channel's session replies.
 */
export async function sendTemplate(
  toPhone: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode = "en",
): Promise<void> {
  const liveMode = process.env.NOTIFICATION_TEST_MODE === "off";
  let to = toPhone;
  if (!liveMode) {
    // A template send targets one recipient; use the first configured test number.
    const testTo = (process.env.NOTIFICATION_TEST_WHATSAPP ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (!testTo) {
      console.warn(
        "[whatsapp] test mode on but NOTIFICATION_TEST_WHATSAPP is unset — skipping template send (fail-closed).",
      );
      throw BadRequestError.WhatsappSend("test recipient not configured");
    }
    to = testTo;
  }

  await postMessage({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });
}

export type WhatsappListRow = {
  id: string;
  title: string;
  description?: string;
};

/**
 * Send an interactive LIST message. Unlike reply buttons (title capped at 20
 * chars), list rows show a title (<=24) PLUS a description (<=72), so the full
 * suggestion text is visible. Up to 10 rows. The user taps `buttonLabel` to open
 * the list, then taps a row (whose `id` payload comes back as the reply).
 */
export async function sendList(
  toPhone: string,
  bodyText: string,
  rows: WhatsappListRow[],
  buttonLabel = "Options",
): Promise<void> {
  await postMessage({
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description
                ? { description: r.description.slice(0, 72) }
                : {}),
            })),
          },
        ],
      },
    },
  });
}

export type WhatsappButton = { id: string; title: string };

/**
 * Send an interactive reply-button message (used for the Confirm/Cancel gate).
 * Button titles are capped at 20 chars and ids at 256 by Meta — callers must
 * respect that (the confirm nonce fits well within 256).
 */
export async function sendButtons(
  toPhone: string,
  bodyText: string,
  buttons: WhatsappButton[],
): Promise<void> {
  await postMessage({
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}
