import { WhatsappInboundJob } from "@prisma/client";
import { ServiceLocator } from "../../../services";
import { getActiveModel } from "../../../lib/openrouter";
import { markRead, sendButtons, sendList, sendText } from "../../../lib/whatsapp";
import { consumeRateLimit } from "../../../lib/rateLimiter";
import {
  NormalizedInboundMessage,
  parseLinkCode,
} from "../../../shared/dtos/WhatsappDTOs";
import { runMerchantTurn } from "../../assistants/merchant/loop";
import { executeConfirmation } from "../../assistants/merchant/gate";
import { systemPromptHash } from "../../assistants/merchant/merchantSystemPrompt";

/**
 * WhatsApp × Merchant turn-runner — the (door × brain) pairing that puts the
 * WhatsApp channel in front of the MERCHANT assistant (runMerchantTurn /
 * executeConfirmation). A transport, peer to merchantChatRouter, NOT a service. It's
 * reached only from the inbound worker. Scope is derived EXCLUSIVELY from the
 * verified WhatsappLink (never the message payload), which is what keeps the
 * agent's existing in-process RBAC/ownership re-check valid on this channel.
 *
 * To add WhatsApp for the concierge brain later, add a sibling
 * `channels/whatsapp/concierge.ts` — this file does not change.
 *
 * Idle-reuse window: continue the pinned conversation while inbound activity is
 * recent; otherwise start fresh. "reset"/"new chat" forces a new conversation.
 */

const CONVERSATION_IDLE_MS = 6 * 60 * 60 * 1000; // 6h
const RESET_KEYWORDS = new Set(["reset", "new", "new chat", "/reset", "/new"]);

// Per-phone Denial-of-Wallet guard for the turn path (the webhook is public and
// has no req.auth, so the HTTP rateLimit middleware can't cover it). Uses the
// SAME shared limiter core as every other limit (src/lib/rateLimiter) — keyed on
// the phone — so it inherits the pluggable store (Redis-ready) for free. Over
// the limit, the message is dropped (no reply → no spam).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.WHATSAPP_RATE_MAX ?? 20);
async function rateLimited(phone: string): Promise<boolean> {
  const { allowed } = await consumeRateLimit(`wa-inbound:${phone}`, {
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
  });
  return !allowed;
}

/**
 * Keep the "typing…" indicator visible for the WHOLE turn. Meta dismisses it
 * after 25s, but a deepseek turn can run longer — so re-assert it every 10s until
 * we reply. Best-effort (markRead swallows errors). Returns a stopper to call
 * once the reply is sent (the reply itself also dismisses the indicator).
 */
function startTypingKeepAlive(messageId: string): () => void {
  const timer = setInterval(() => {
    void markRead(messageId, true);
  }, 10_000);
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

// Confirm-card button ids carry the parked action's nonce (fits Meta's 256-char
// button-id limit). The worker routes a button tap back to executeConfirmation.
const CONFIRM_PREFIX = "wa_confirm:";
const CANCEL_PREFIX = "wa_cancel:";
// A tapped suggestion chip carries the full suggestion text as the next message.
const SUGGEST_PREFIX = "wa_suggest:";

// Telemetry channel tag (PostHog `api`/url) so WhatsApp turns are filterable
// apart from web chat turns. Path-only, env-free — matches the web convention.
const WHATSAPP_API = "WHATSAPP /webhooks/whatsapp";

// Channel tone appended to the system prompt — format for a phone screen, clean
// and scannable. (A deterministic formatter normalizes the output too, but a
// well-structured generation needs far less cleanup.)
const WHATSAPP_TONE = `

CHANNEL: WhatsApp — format every reply for a phone screen, clean and scannable:
- Open with the answer in ONE short line.
- For any list of items, use ONE bullet per item in this exact shape: "- *Name* — detail, status". One line each; no markdown tables, no # headings.
- Separate distinct sections with a single blank line. Keep the whole reply tight — under ~7 lines unless you're listing items.
- Use *single-asterisk bold* for names/labels ONLY — never bold whole sentences, never **double asterisks**.
- Be warm but concise: no filler, no "I'd be happy to…", no restating the question.
- Always end with the SUGGESTIONS line: 2-4 options, each 2-3 words, under ~24 chars (e.g. "Add a class", "Show my catalog").`;

function parseConfirmButton(
  buttonId: string,
): { nonce: string; approve: boolean } | null {
  if (buttonId.startsWith(CONFIRM_PREFIX)) {
    return { nonce: buttonId.slice(CONFIRM_PREFIX.length), approve: true };
  }
  if (buttonId.startsWith(CANCEL_PREFIX)) {
    return { nonce: buttonId.slice(CANCEL_PREFIX.length), approve: false };
  }
  return null;
}

/**
 * Split the agent's trailing "SUGGESTIONS: a | b | c" line off the reply. The
 * web app renders it as chips; on WhatsApp it would show as raw text, so we
 * strip it and render the items as reply buttons instead.
 */
function parseSuggestions(reply: string): {
  clean: string;
  suggestions: string[];
} {
  const lines = reply.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*SUGGESTIONS\s*:/i.test(l));
  if (idx === -1) return { clean: reply, suggestions: [] };
  const suggestions = lines[idx]
    .replace(/^\s*SUGGESTIONS\s*:/i, "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const clean = [...lines.slice(0, idx), ...lines.slice(idx + 1)]
    .join("\n")
    .trim();
  return { clean, suggestions };
}

/**
 * A WhatsApp list-row title caps at 24 chars. Trim at a WORD boundary so it never
 * cuts mid-word ("Show me what I currentl"); the full text rides in the row's
 * description. Short suggestions (<=24) are returned whole.
 */
function listTitle(s: string): string {
  if (s.length <= 24) return s;
  const cut = s.slice(0, 24);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Normalize typographic chars that look off on WhatsApp (smart quotes, middle
 *  dot) to plain ASCII. Used on confirm-card labels. */
function cleanWa(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "-");
}

/** Split a markdown table row "| a | b |" into trimmed cells. */
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Normalize the model's free-form markdown into ONE clean, consistent WhatsApp
 * style — so replies look intentional, not "AI-generated". Deterministic backstop
 * regardless of how the model formatted things:
 *   1. markdown tables → bold-titled blocks (WhatsApp has no tables)
 *   2. **double** → *single* bold; # headings → *bold*
 *   3. every bullet style (•, *, –, —, ◦…) → "- " (WhatsApp renders native bullets)
 *   4. trim trailing whitespace; collapse 3+ blank lines → one
 */
function formatForWhatsapp(text: string): string {
  const lines = text.split(/\r?\n/);
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const header = splitTableRow(lines[i]);
      i += 2; // skip header + separator
      while (i < lines.length && isRow(lines[i])) {
        const cells = splitTableRow(lines[i]);
        const title = cells[0] ?? "";
        const rest = header
          .slice(1)
          .map((h, idx) => ({ h, v: cells[idx + 1] ?? "" }))
          .filter((p) => p.v)
          .map((p) => `${p.h}: ${p.v}`)
          .join(" — ");
        out.push(rest ? `- *${title}* — ${rest}` : `- *${title}*`);
        i++;
      }
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **bold** -> *bold* (WhatsApp uses single)
    .replace(/^#{1,6}\s*(.+?)\s*$/gm, "*$1*") // # heading -> *bold*
    .replace(/^[ \t]*[•·▪◦‣‒–—]\s+/gm, "- ") // unicode bullets/dashes -> "- "
    .replace(/^[ \t]*\*[ \t]+/gm, "- ") // "* item" bullet (not *bold*) -> "- "
    .replace(/[ \t]+$/gm, "") // trailing whitespace
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .trim();
}

/**
 * Send the agent reply, then EITHER the Confirm/Cancel cards for parked actions
 * OR (when nothing is parked) the suggestions as an interactive LIST (rows show
 * full text via the description; reply buttons would truncate at 20 chars).
 * Markdown tables in the reply are reformatted for WhatsApp first.
 */
async function sendMerchantReply(
  phone: string,
  reply: string,
  pending: { nonce: string; label: string }[],
): Promise<void> {
  const { clean, suggestions } = parseSuggestions(reply);
  const body = formatForWhatsapp(clean);

  // Parked actions. Single action (the common case): ONE bubble — the card with
  // the action label as its body + Confirm/Cancel (no redundant "Just confirm…"
  // text). Multiple: a short lead-in, then one card each.
  if (pending.length === 1) {
    const p = pending[0];
    await sendButtons(phone, cleanWa(p.label), [
      { id: `${CONFIRM_PREFIX}${p.nonce}`, title: "Confirm" },
      { id: `${CANCEL_PREFIX}${p.nonce}`, title: "Cancel" },
    ]);
    return;
  }
  if (pending.length) {
    if (body) await sendText(phone, body);
    for (const p of pending) {
      await sendButtons(phone, cleanWa(p.label), [
        { id: `${CONFIRM_PREFIX}${p.nonce}`, title: "Confirm" },
        { id: `${CANCEL_PREFIX}${p.nonce}`, title: "Cancel" },
      ]);
    }
    return;
  }

  // Suggestions ride ON the reply as ONE interactive list (no separate bubble).
  // List rows show full text via the description (reply buttons truncate at 20).
  // Interactive bodies cap at 1024 chars, so a long reply just goes as plain text.
  if (suggestions.length && body && body.length <= 1024) {
    await sendList(
      phone,
      body,
      suggestions.slice(0, 10).map((s) => {
        const title = listTitle(s);
        return {
          id: `${SUGGEST_PREFIX}${s}`,
          title,
          // Full text in the description whenever the title had to be shortened.
          description: title === s ? undefined : s,
        };
      }),
    );
    return;
  }

  if (body) await sendText(phone, body);
}

/**
 * Resolve (reuse or create) the conversation for an active link. Returns the
 * conversation's stored model too — reusing it (instead of getActiveModel())
 * keeps a conversation on one model for its lifetime, matching the web path.
 */
async function resolveConversation(link: {
  id: number;
  merchantId: number;
  locationId: number | null;
  userId: number;
  activeConversationId: number | null;
  lastInboundAt: Date | null;
}): Promise<{ conversationId: number; model: string }> {
  const fresh =
    link.activeConversationId &&
    link.lastInboundAt &&
    Date.now() - link.lastInboundAt.getTime() < CONVERSATION_IDLE_MS;

  if (fresh && link.activeConversationId) {
    const convo =
      await ServiceLocator.MerchantChatConversationService.internal.getConversationById(
        link.activeConversationId,
      );
    await ServiceLocator.WhatsappLinkService.internal.touchInbound(link.id);
    return { conversationId: convo.id, model: convo.model };
  }

  const merchant = await ServiceLocator.MerchantService.public.getMerchantById(
    link.merchantId,
    {},
  );
  const conversation =
    await ServiceLocator.MerchantChatConversationService.internal.createConversation({
      merchantId: link.merchantId,
      locationId: link.locationId,
      userId: link.userId,
      model: getActiveModel(),
      systemPromptHash: systemPromptHash({
        merchantName: merchant.name,
        merchantId: link.merchantId,
        locationId: link.locationId,
      }),
    });
  await ServiceLocator.WhatsappLinkService.internal.setActiveConversation(
    link.id,
    conversation.id,
  );
  return { conversationId: conversation.id, model: conversation.model };
}

async function handleLinkAttempt(
  phone: string,
  text: string,
): Promise<void> {
  const code = parseLinkCode(text);
  if (!code) {
    await sendText(
      phone,
      "To use this assistant, please link your number from your dashboard (Settings > WhatsApp). You'll get a link to tap.",
    );
    return;
  }
  const redeemed =
    await ServiceLocator.WhatsappLinkService.internal.redeemCode(code, phone);
  if (!redeemed) {
    await sendText(
      phone,
      "That link code is invalid or has expired. Please generate a new one from your dashboard.",
    );
    return;
  }
  const merchant = await ServiceLocator.MerchantService.public.getMerchantById(
    redeemed.merchantId,
    {},
  );
  await sendText(
    phone,
    `You're all set. I'm your assistant for *${merchant.name}*. I can help you manage classes, camps, packages, schedules and more, right here on WhatsApp. What would you like to do first?`,
  );
}

async function handleButton(
  phone: string,
  link: {
    id: number;
    merchantId: number;
    locationId: number | null;
    userId: number;
  },
  buttonId: string,
): Promise<void> {
  const parsed = parseConfirmButton(buttonId);
  if (!parsed) return; // not one of our confirm buttons — ignore

  // Tenancy guard (mirrors merchantChatRouter /ai/confirm lines 199-205): the parked
  // action must belong to THIS phone's bound scope before we execute it. Also
  // gives us the action's OWN conversation for the follow-up (link's active one
  // can be null/stale). A missing nonce → treat as expired.
  let pendingConversationId: number;
  let pendingModel: string;
  try {
    const pending =
      await ServiceLocator.MerchantChatConversationService.internal.getPendingByNonce(
        parsed.nonce,
      );
    const convo =
      await ServiceLocator.MerchantChatConversationService.internal.getConversationById(
        pending.conversationId,
      );
    if (
      convo.userId !== link.userId ||
      convo.merchantId !== link.merchantId ||
      (convo.locationId ?? null) !== (link.locationId ?? null)
    ) {
      console.warn(
        `[whatsapp] confirm nonce/scope mismatch phone-link=${link.id} convo=${convo.id}`,
      );
      await sendText(phone, "That confirmation isn't available anymore.");
      return;
    }
    pendingConversationId = pending.conversationId;
    pendingModel = convo.model;
  } catch {
    await sendText(
      phone,
      "That confirmation expired. Just ask me again and I'll set it up.",
    );
    return;
  }

  const outcome = await executeConfirmation(parsed.nonce, parsed.approve);

  if (outcome.status === "declined") {
    await sendText(phone, "No problem, I've cancelled that. Anything else?");
    return;
  }
  if (outcome.status === "expired") {
    await sendText(
      phone,
      "That confirmation expired. Just ask me again and I'll set it up.",
    );
    return;
  }
  if (outcome.status === "already_resolved") {
    await sendText(phone, "That one has already been handled.");
    return;
  }

  // Confirmed: the WRITE already landed. Everything below is UI-only and MUST
  // NOT throw — the gate is single-use, so a thrown follow-up would dead-letter a
  // job whose real work succeeded (and the merchant already got their change).
  try {
    const merchant =
      await ServiceLocator.MerchantService.public.getMerchantById(
        link.merchantId,
        {},
      );
    const turn = await runMerchantTurn({
      conversationId: pendingConversationId,
      scope: {
        merchantId: link.merchantId,
        locationId: link.locationId ?? undefined,
        userId: link.userId,
      },
      merchantName: merchant.name,
      model: pendingModel,
      userMessage:
        "The change the merchant just confirmed has now been applied. In one short, friendly message, show them the updated result based on a FRESH lookup. Do not take further action and do not ask a question — just show the updated result.",
      persistTurns: false,
      api: WHATSAPP_API,
      systemSuffix: WHATSAPP_TONE,
    });
    await sendMerchantReply(phone, turn.reply, turn.pending);
  } catch (e) {
    console.error("[whatsapp] confirm follow-up failed:", e);
    await sendText(phone, "Done. That change has been applied.").catch(
      () => undefined,
    );
  }
}

/**
 * Process one inbound job. Throws on a hard failure (the worker marks the job
 * FAILED + dead-letters); a handled/expected outcome returns normally.
 */
export async function processInboundJob(
  job: WhatsappInboundJob,
): Promise<void> {
  const msg = job.payload as unknown as NormalizedInboundMessage;
  const phone = job.phoneE164;

  // Denial-of-Wallet guard: drop (don't reply) when a phone exceeds the window.
  if (await rateLimited(phone)) {
    console.warn(`[whatsapp] rate limit hit for phone (dropping message)`);
    return;
  }

  // Acknowledge instantly: blue ticks + a typing indicator, kept alive for the
  // whole turn (deepseek can exceed Meta's 25s cap). Stopped in `finally` — the
  // reply itself also dismisses it. We always reply past this point.
  await markRead(msg.providerMessageId, true);
  const stopTyping = startTypingKeepAlive(msg.providerMessageId);
  try {
    await processInbound(msg, phone);
  } finally {
    stopTyping();
  }
}

/** Inner handler — typing keep-alive is managed by the caller (processInboundJob). */
async function processInbound(
  msg: NormalizedInboundMessage,
  phone: string,
): Promise<void> {
  const link =
    await ServiceLocator.WhatsappLinkService.internal.findActiveByPhone(phone);

  // --- Unbound phone: only a link code is actionable ---
  if (!link) {
    if (msg.kind === "text" && msg.text) {
      await handleLinkAttempt(phone, msg.text);
    } else {
      await sendText(
        phone,
        "To use this assistant, please link your number from your dashboard first.",
      );
    }
    return;
  }

  // --- Button tap: confirm gate, or a suggestion chip replayed as a message ---
  let text = (msg.text ?? "").trim();
  if (msg.kind === "button" && msg.buttonId) {
    if (msg.buttonId.startsWith(SUGGEST_PREFIX)) {
      text = msg.buttonId.slice(SUGGEST_PREFIX.length).trim();
    } else {
      await handleButton(phone, link, msg.buttonId);
      return;
    }
  }
  if (!text) return;

  // Already-connected phone re-tapped the connect deep link (text carries a
  // "LINK-<code>" token). The code can't re-bind an active phone, and feeding the
  // connect boilerplate to the agent reads oddly — just acknowledge. Matches the
  // explicit LINK- prefix only, so a normal short message isn't misread.
  if (/LINK-[A-Z0-9]{6,16}/i.test(text)) {
    const m = await ServiceLocator.MerchantService.public.getMerchantById(
      link.merchantId,
      {},
    );
    await sendText(
      phone,
      `You're already connected to *${m.name}*. What would you like to do next?`,
    );
    return;
  }

  if (RESET_KEYWORDS.has(text.toLowerCase())) {
    await ServiceLocator.WhatsappLinkService.internal.clearActiveConversation(
      link.id,
    );
    await sendText(
      phone,
      "Started a fresh chat. What would you like to do?",
    );
    return;
  }

  const { conversationId, model } = await resolveConversation(link);
  const merchant = await ServiceLocator.MerchantService.public.getMerchantById(
    link.merchantId,
    {},
  );

  // runMerchantTurn only persists history on success — if it THROWS, nothing is written,
  // so the job can safely retry. Once it RETURNS, the turn is committed (history +
  // parked nonces); a send failure after that must NOT rethrow, or the retry would
  // re-run the turn (double history, duplicate confirm card with a new nonce).
  const result = await runMerchantTurn({
    conversationId,
    scope: {
      merchantId: link.merchantId,
      locationId: link.locationId ?? undefined,
      userId: link.userId,
    },
    merchantName: merchant.name,
    model,
    userMessage: text,
    api: WHATSAPP_API,
    systemSuffix: WHATSAPP_TONE,
  });

  try {
    await sendMerchantReply(phone, result.reply, result.pending);
  } catch (e) {
    console.error("[whatsapp] reply send failed (turn already committed):", e);
  }
}
