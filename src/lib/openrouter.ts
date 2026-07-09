/**
 * Thin OpenRouter client for the AI agent loop — the ONLY place that talks to
 * the LLM provider. Mirrors the `lib/stripe.ts` pattern: config is read from
 * env once (lazy), the boot check WARNS (never crashes) when the key is missing
 * so the rest of the app still boots, and the key is only required when a chat
 * call is actually made.
 *
 * Exposes a streaming chat completion (the fast path — the router forwards
 * `content` deltas to the client over SSE as they arrive) that also assembles
 * any `tool_calls` from the delta stream so the agent loop can dispatch them.
 */

export type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
};

export type OpenRouterTool = {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
};

export type OpenRouterUsage = {
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
};

/** App-attribution / cost-tracking context for one chat call (rule 08-style). */
export type ChatAttribution = {
  /** Merchant id — fallback host (`merchant-<id>.<base>`) only when there's no
   *  usable store name; the per-merchant OpenRouter app is normally keyed on the
   *  store-name slug (see appAttributionHeaders). */
  merchantId?: number;
  /** Merchant store name — becomes BOTH the per-merchant app host (slugified, e.g.
   *  "myGym" → mygym.<base>) and the app title (X-Title). */
  storeName?: string;
  /** Stable per-merchant id for OpenRouter's `user` field (cost attribution). */
  user?: string;
};

/** Events yielded by the streaming completion. */
export type ChatStreamEvent =
  | { type: "content"; delta: string }
  | {
      type: "final";
      message: OpenRouterMessage;
      finishReason: string | undefined;
      usage: OpenRouterUsage;
    };

type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
  dataPolicy: string;
  appUrl: string;
  appTitle: string;
  /** App URL WITHOUT the env suffix — base for per-merchant referers. */
  appUrlBase: string;
  /** "production" | "development" — folded into per-merchant referers. */
  env: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

function readConfig(): OpenRouterConfig {
  // AI_MODELS is a comma-separated priority chain; the request loop falls back
  // model → model when one is unavailable.
  const models = (process.env.AI_MODELS || "google/gemini-2.5-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // App identity for OpenRouter activity, fixed PER-ENVIRONMENT and STABLE.
  // OpenRouter keys an "app" by HTTP-Referer and displays the LATEST X-Title it
  // saw for it, so a varying/per-merchant title retroactively relabels the whole
  // history. We send a constant env-specific identity instead, which also makes
  // prod and dev show up as separate apps. Per-merchant attribution → `user`.
  const env =
    (process.env.NODE_ENV || "development") === "production"
      ? "production"
      : "development";
  const appUrlBase = process.env.OPENROUTER_APP_URL || "https://jungle.baby";
  const appTitleBase =
    process.env.OPENROUTER_APP_TITLE || "jungle-merchant-config";
  return {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    model: models[0] || "google/gemini-2.5-flash",
    models,
    // "deny" → ask OpenRouter to route only to no-log / no-train providers.
    dataPolicy: (process.env.OPENROUTER_DATA_POLICY || "").toLowerCase(),
    appUrl: env === "production" ? appUrlBase : `${appUrlBase}/${env}`,
    appTitle: env === "production" ? appTitleBase : `${appTitleBase}-${env}`,
    appUrlBase,
    env,
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || 30000),
    // Cap the per-call completion size — bounds cost and stops a single response
    // from ballooning (OWASP "Denial of Wallet"). Replies + tool-call args are
    // short, so 2000 is a generous default; prod-tunable via env.
    maxOutputTokens: Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 2000),
  };
}

let _config: OpenRouterConfig | null = null;
function getConfig(): OpenRouterConfig {
  if (!_config) _config = readConfig();
  return _config;
}

/** The active model id — recorded on each AiConversation / AiModelCall. */
export function getActiveModel(): string {
  return getConfig().model;
}

/**
 * The concierge's OWN model priority chain — deliberately INDEPENDENT of the
 * merchant agent's `AI_MODELS`. The merchant agent leads with a heavy, capable
 * model for tool-heavy store configuration; the concierge task (summarise a
 * deterministic search in plain language) is light, so it leads with a FAST
 * model — the dominant lever on concierge latency (a heavy model spends ~7s per
 * round-trip; a fast one ~1-2s). Env `CONCIERGE_MODELS` (comma-separated
 * priority chain, tried left→right on failure); defaults to a fast Gemini chain.
 */
export function getConciergeModels(): string[] {
  const chain = (
    process.env.CONCIERGE_MODELS ||
    "google/gemini-2.5-flash,google/gemini-3.1-flash-lite"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain.length ? chain : ["google/gemini-2.5-flash"];
}

/** First model in the concierge chain — recorded on the ConciergeConversation. */
export function getConciergeModel(): string {
  return getConciergeModels()[0];
}

/**
 * Optional upstream-provider preference for the concierge, so DeepSeek (and any
 * multi-provider model) routes to a FAST host instead of OpenRouter's cheapest-by-
 * default — which for us was AkashML/Parasail at ~16-28 tok/s. Comma-separated
 * provider slugs, tried in order with fallbacks ON (so non-DeepSeek models in the
 * chain, and momentary outages, still route normally). Env CONCIERGE_PROVIDER_ORDER;
 * default "AtlasCloud,Novita" (measured ~62 / ~56 tok/s). Set empty to disable.
 */
export function getConciergeProviderOrder(): string[] {
  return (process.env.CONCIERGE_PROVIDER_ORDER ?? "AtlasCloud,Novita")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True once a key is present; the agent endpoints surface a clean error otherwise. */
export function isOpenRouterConfigured(): boolean {
  return !!getConfig().apiKey;
}

/**
 * Run at app boot (mirror `validateStripeConfig`). Logs the active model; warns
 * — does NOT throw — when the key is missing, so the rest of the app still boots
 * in environments where the AI chat isn't configured yet.
 */
export function validateOpenRouterConfig(): void {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    console.warn(
      "[openrouter] OPENROUTER_API_KEY not set — the AI chat endpoint will return a clean error until it is configured in .env",
    );
    return;
  }
  console.log(
    `[openrouter] AI chat configured (models ${cfg.models.join(" → ")}${
      cfg.dataPolicy === "deny" ? ", data_collection=deny" : ""
    })`,
  );
}

/** HTTP header values must be Latin-1/ASCII-safe (merchant names can hold emoji). */
function headerSafe(s: string): string {
  return String(s)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Store name → DNS-label slug for a per-merchant subdomain (max 63 chars). */
function slugifyStore(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/**
 * Resolve the per-call OpenRouter "app" identity (HTTP-Referer + X-Title).
 *
 * OpenRouter groups "apps" by the referer's ORIGIN (host), NOT the path, and
 * always displays that host. So we make the host READ LIKE THE STORE: a slug of
 * the store name as a subdomain (e.g. "myGym" → https://mygym.jungle.baby), with
 * the store name as the title. Distinct origin per store ⇒ its own app; the URL
 * is sensible (the store), not an opaque id. Env separation is via the configured
 * base host (OPENROUTER_APP_URL) — set a distinct host per environment if you want
 * prod/dev split in OpenRouter (PostHog already tags `environment`). Falls back to
 * a merchant-id host, then the app URL, when there's no usable store name.
 */
export function appAttributionHeaders(attribution: ChatAttribution): {
  referer: string;
  title: string;
} {
  const cfg = getConfig();
  const host = cfg.appUrlBase.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const slug = slugifyStore(attribution.storeName || "");
  let referer = cfg.appUrl;
  if (slug) {
    referer = `https://${slug}.${host}`;
  } else if (attribution.merchantId != null) {
    referer = `https://merchant-${attribution.merchantId}.${host}`;
  }
  const title = headerSafe(attribution.storeName || "") || cfg.appTitle;
  return { referer, title };
}

/**
 * Streaming chat completion. Yields `content` deltas as they arrive (forwarded
 * to the client over SSE) and a terminal `final` event carrying the fully
 * assembled message (including any `tool_calls`), finish reason, and usage.
 *
 * Throws a plain Error on transport/config failure — the agent loop maps it to
 * a clean, user-facing message (and never leaks the key).
 */
export async function* streamChatCompletion(
  messages: OpenRouterMessage[],
  tools: OpenRouterTool[],
  attribution: ChatAttribution = {},
  // Optional per-call model chain override. When omitted, the merchant agent's
  // `AI_MODELS` chain is used (unchanged). The concierge passes its own fast
  // chain here — additive, so this path stays identical for every other caller.
  opts: { models?: string[]; providerOrder?: string[] } = {},
): AsyncGenerator<ChatStreamEvent> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const modelChain = opts.models?.length ? opts.models : cfg.models;
  // Provider routing. When the caller pins an upstream provider order (the
  // concierge does, to reach a FAST DeepSeek host instead of OpenRouter's slow
  // cheapest-by-default), prefer those with allow_fallbacks ON so a model the
  // ordered providers don't serve (e.g. a Gemini in the chain) still routes
  // normally. Merged with the no-log governance policy into one `provider` object.
  const providerRouting = {
    ...(opts.providerOrder?.length
      ? { order: opts.providerOrder, allow_fallbacks: true }
      : {}),
    ...(cfg.dataPolicy === "deny" ? { data_collection: "deny" } : {}),
  };
  const hasProviderRouting = Object.keys(providerRouting).length > 0;
  // Per-merchant, env-stable app identity (HTTP-Referer + X-Title).
  const appHeaders = appAttributionHeaders(attribution);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const backoffMs = (attempt: number) =>
    700 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
  const MAX_ATTEMPTS = 2; // 1 retry per model, then fall through to the next in the chain

  let controller!: AbortController;
  let timer!: ReturnType<typeof setTimeout>;
  let res: Response | undefined;
  let success = false;
  let lastError: Error | undefined;

  // Try each model in the priority chain. Each gets a few backoff retries on
  // transient errors; a hard failure (rate-limit that won't clear, no compliant
  // provider, etc.) falls through to the next model. Only when EVERY model fails
  // do we throw — the agent loop then turns it into a clean "trouble reaching the
  // assistant" reply for the merchant.
  for (const model of modelChain) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      try {
        res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.apiKey}`,
            "HTTP-Referer": appHeaders.referer,
            "X-Title": appHeaders.title,
          },
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: "auto",
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: cfg.maxOutputTokens,
            ...(attribution.user ? { user: attribution.user } : {}),
            // Provider routing: caller-pinned fast-host order merged with the
            // no-log governance policy (see providerRouting above). Omitted when
            // neither is set, so default routing is unchanged for other callers.
            ...(hasProviderRouting ? { provider: providerRouting } : {}),
          }),
        });
      } catch (e) {
        clearTimeout(timer);
        lastError = e instanceof Error ? e : new Error(String(e));
        // Network blip → retry then move on; timeout/abort → give up on this model.
        if ((e as Error)?.name !== "AbortError" && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break; // → next model in the chain
      }

      if (res.ok && res.body) {
        success = true; // keep the timer armed for the stream below
        break;
      }

      clearTimeout(timer);
      const text = await safeText(res);
      lastError = new Error(
        `OpenRouter (${model}) responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
      // Retry transient statuses (429 rate-limit, 408, 5xx) with backoff —
      // honoring Retry-After — before falling through to the next model.
      const retriable =
        res.status === 429 || res.status === 408 || res.status >= 500;
      if (retriable && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        continue;
      }
      break; // non-retriable (e.g. no provider for this model) → next model
    }
    if (success) break;
  }

  if (!success || !res || !res.body) {
    throw lastError ?? new Error("OpenRouter request failed");
  }

  try {
    let content = "";
    const toolCalls: OpenRouterToolCall[] = [];
    let finishReason: string | undefined;
    let usage: OpenRouterUsage = {};

    for await (const data of readSseData(res.body)) {
      if (data === "[DONE]") break;

      let chunk: SseChunk;
      try {
        chunk = JSON.parse(data) as SseChunk;
      } catch {
        continue; // ignore keep-alive / malformed lines
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        content += delta.content;
        yield { type: "content", delta: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) assembleToolCall(toolCalls, tc);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          costUsd: chunk.usage.cost,
        };
      }
    }

    yield {
      type: "final",
      message: {
        role: "assistant",
        content: content || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finishReason,
      usage,
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- SSE / delta assembly internals -----------------------------------------

type SseToolCallDelta = {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type SseChunk = {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: SseToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

/** Accumulate a streamed tool-call delta into the by-index assembled list. */
function assembleToolCall(
  acc: OpenRouterToolCall[],
  delta: SseToolCallDelta,
): void {
  const i = delta.index;
  if (!acc[i]) {
    acc[i] = {
      id: "",
      type: "function",
      function: { name: "", arguments: "" },
    };
  }
  const cur = acc[i];
  if (delta.id) cur.id = delta.id;
  if (delta.function?.name) cur.function.name += delta.function.name;
  if (delta.function?.arguments)
    cur.function.arguments += delta.function.arguments;
}

/** Read an SSE response body and yield each `data:` payload line. */
async function* readSseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
