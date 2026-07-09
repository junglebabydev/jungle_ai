import express, { NextFunction, Request, Response } from "express";
import { HTTPS_STATUS_CODE } from "../shared/enums";
import {
  runProductDiscovery,
  RunProductDiscoveryInput,
} from "../ai/assistants/concierge/productDiscovery";
import {
  runMerchantLocationChat,
  RunMerchantLocationChatInput,
} from "../ai/assistants/concierge/merchantLocationChat";
import { runMerchantTurn, RunMerchantTurnInput } from "../ai/assistants/merchant/loop";
import { executeConfirmation } from "../ai/assistants/merchant/gate";
import { ALL_TOOLS } from "../ai/assistants/merchant/tools/registry";
import { systemPromptHash } from "../ai/assistants/merchant/merchantSystemPrompt";
import { getActiveModel } from "../lib/openrouter";
import { ServiceLocator } from "../services";
import { wakeWhatsappWorker } from "../worker/whatsappWorker";

/**
 * Internal AI-compute endpoints. The conversation lifecycle + HTTP orchestration live
 * in booking (it owns the shared conversation tables and the public routers); this
 * service ONLY runs the LLM turn. Each endpoint takes the turn input booking already
 * built (incl. the numeric `conversationId` of a row booking created in the shared DB),
 * runs the assistant, and streams the reply over SSE when the caller sends
 * `Accept: text/event-stream` — otherwise returns JSON. Mounted behind
 * `serviceAuthMiddleware` (x-api-key); only booking's `aiClient` reaches it.
 *
 * SSE event contract (matches what booking re-emits to its own clients):
 *   { type: "token", delta }  ·  { type: "reset" }  ·  { type: "done", ...result }
 */
const aiRunRouter = express.Router();

function wantsStream(req: Request): boolean {
  return (req.headers.accept || "").includes("text/event-stream");
}

// Smoothing pacer for SSE output. Some providers (e.g. Gemini, which the concierge
// uses for its fast search) stream in large ~100-char chunks; buffering them and
// releasing small pieces at a fixed cadence gives an even token-by-token "typing"
// feel regardless of provider granularity. The drain is ADAPTIVE — it releases
// ceil(backlog / DIVISOR) chars per tick, so a big backlog catches up fast while a
// fine-grained model (DeepSeek) passes through with roughly one tick of lag. Net
// added latency is a small, bounded tail — TTFT is unchanged (the first chars go
// out on the first tick after they arrive).
const PACER_TICK_MS = 16;
const PACER_DIVISOR = 5;

function createStreamPacer(send: (obj: unknown) => void) {
  let buf = "";
  let timer: ReturnType<typeof setInterval> | null = null;
  let ended = false;
  let onDrained: (() => void) | null = null;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const cb = onDrained;
    onDrained = null;
    cb?.();
  };

  const drain = () => {
    if (buf.length > 0) {
      const n = Math.max(1, Math.ceil(buf.length / PACER_DIVISOR));
      send({ type: "token", delta: buf.slice(0, n) });
      buf = buf.slice(n);
    }
    if (buf.length === 0 && ended) stop();
  };

  return {
    push: (delta: string) => {
      if (!delta) return;
      buf += delta;
      if (!timer && !ended) timer = setInterval(drain, PACER_TICK_MS);
    },
    // Discard everything buffered this turn (a leaked preamble / safety flip) and
    // tell the client to clear what it has rendered.
    reset: () => {
      buf = "";
      send({ type: "reset" });
    },
    // Resolve once the buffer has fully drained to the client.
    flush: (): Promise<void> =>
      new Promise((resolve) => {
        ended = true;
        if (buf.length === 0) {
          stop();
          resolve();
        } else {
          onDrained = resolve;
        }
      }),
    stop,
  };
}

/** Run a turn, streaming SSE if asked, else replying JSON. `run` receives the SSE
 *  callbacks and resolves with the turn result to send as the final `done` frame. */
async function streamOrJson<T extends object>(
  req: Request,
  res: Response,
  run: (cbs: {
    onToken: (delta: string) => void;
    onReset: () => void;
  }) => Promise<T>,
): Promise<void> {
  if (wantsStream(req)) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.socket?.setNoDelay(true);
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const pacer = createStreamPacer(send);
    res.on("close", pacer.stop);
    try {
      const result = await run({ onToken: pacer.push, onReset: pacer.reset });
      await pacer.flush();
      send({ type: "done", ...result });
      res.end();
    } finally {
      pacer.stop();
    }
    return;
  }
  const result = await run({ onToken: () => {}, onReset: () => {} });
  res.status(HTTPS_STATUS_CODE.OK).json(result);
}

/**
 * POST /concierge/run
 * Run one concierge turn (discovery or merchant-location, by `scope`).
 * Body: `RunConciergeTurnInput` (minus the callbacks). Result: `{ reply, results }`.
 */
aiRunRouter.post(
  "/concierge/run",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = req.body as
        | RunProductDiscoveryInput
        | RunMerchantLocationChatInput;
      await streamOrJson(req, res, (cbs) =>
        "scope" in input && input.scope
          ? runMerchantLocationChat({
              ...(input as RunMerchantLocationChatInput),
              ...cbs,
            })
          : runProductDiscovery({
              ...(input as RunProductDiscoveryInput),
              ...cbs,
            }),
      );
    } catch (e) {
      next(e);
    }
  },
);

/**
 * POST /ai/conversations
 * Create a merchant-config conversation. This lives here (not booking) because the
 * stored `systemPromptHash` is a hash of the assistant's system prompt, which only this
 * service has. Body: `{ merchantId, locationId?, userId, merchantName }`. Returns the
 * created conversation row (booking reads its `id` + `model`).
 */
aiRunRouter.post(
  "/ai/conversations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { merchantId, locationId, userId, merchantName } = req.body as {
        merchantId: number;
        locationId?: number;
        userId: number;
        merchantName: string;
      };
      const conversation =
        await ServiceLocator.MerchantChatConversationService.internal.createConversation(
          {
            merchantId,
            locationId,
            userId,
            model: getActiveModel(),
            systemPromptHash: systemPromptHash({
              merchantName,
              merchantId,
              locationId,
            }),
          },
        );
      res.status(HTTPS_STATUS_CODE.CREATED).json(conversation);
    } catch (e) {
      next(e);
    }
  },
);

/**
 * POST /ai/run
 * Run one merchant-config turn. Body: `RunMerchantTurnInput` (minus the callbacks).
 * Result: `{ reply, pending }`.
 */
aiRunRouter.post(
  "/ai/run",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = req.body as RunMerchantTurnInput;
      await streamOrJson(req, res, (cbs) =>
        runMerchantTurn({ ...input, ...cbs }),
      );
    } catch (e) {
      next(e);
    }
  },
);

/**
 * POST /ai/confirm
 * Execute (or decline) a parked sensitive action. Body: `{ nonce, approve }`.
 * Result: the `ConfirmOutcome`. (booking runs the ephemeral follow-up turn itself.)
 */
aiRunRouter.post(
  "/ai/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nonce, approve } = req.body as { nonce: string; approve: boolean };
      const outcome = await executeConfirmation(nonce, approve);
      res.status(HTTPS_STATUS_CODE.OK).json(outcome);
    } catch (e) {
      next(e);
    }
  },
);

/**
 * GET /ai/tools
 * Static catalog of the merchant assistant's tool surface (names + descriptions).
 */
aiRunRouter.get("/ai/tools", (_req: Request, res: Response) => {
  const tools = ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
  }));
  res.status(HTTPS_STATUS_CODE.OK).json({ tools });
});

/**
 * POST /internal/whatsapp/wake-worker
 * Wake the inbound worker immediately. booking's webhook fires this (fire-and-forget)
 * right after enqueueing a job, so a reply doesn't wait for the poll interval. The
 * worker's periodic poll is the fallback for missed wakes / restarts.
 */
aiRunRouter.post(
  "/internal/whatsapp/wake-worker",
  (_req: Request, res: Response) => {
    wakeWhatsappWorker();
    res.status(HTTPS_STATUS_CODE.OK).json({ ok: true });
  },
);

export default aiRunRouter;
