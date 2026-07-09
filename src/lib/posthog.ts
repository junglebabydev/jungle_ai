/**
 * Thin PostHog client for backend observability — mirrors the `lib/openrouter.ts`
 * / `lib/stripe.ts` pattern: config is read from env once (lazy), the boot check
 * WARNS (never crashes) when the key is missing so the rest of the app still
 * boots, and the client is only created when something actually captures.
 *
 * Today its only caller is the AI agent's telemetry (`src/ai/shared/evalLog.ts`),
 * which emits LLM-analytics events ($ai_generation / $ai_span). Kept generic so
 * any backend event can reuse it.
 *
 * Capture is fire-and-forget + batched (PostHog buffers and flushes in the
 * background). This is observability, NOT a system of record — on a hard crash
 * the in-memory batch can be lost. `shutdownPostHog()` flushes on graceful exit
 * to bound that window.
 */

import { PostHog } from "posthog-node";

/** prod vs dev — stamped on every event so one project separates environments. */
export const APP_ENVIRONMENT =
  (process.env.NODE_ENV || "development") === "production"
    ? "production"
    : "development";

type PostHogConfig = { apiKey: string; host: string };

function readConfig(): PostHogConfig {
  return {
    apiKey: process.env.POSTHOG_API_KEY || "",
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  };
}

let _config: PostHogConfig | null = null;
function getConfig(): PostHogConfig {
  if (!_config) _config = readConfig();
  return _config;
}

let _client: PostHog | null = null;

/** The shared client, or null when no key is configured (capture becomes a no-op). */
export function getPostHog(): PostHog | null {
  // Never emit under tests — the suite deliberately triggers 4xx/agent paths, and
  // we don't want test data (or network) hitting the real PostHog project.
  if (process.env.NODE_ENV === "test") return null;
  const cfg = getConfig();
  if (!cfg.apiKey) return null;
  if (!_client) {
    _client = new PostHog(cfg.apiKey, {
      host: cfg.host,
      // Small batch + short interval: this is low-volume per process and we want
      // events visible quickly, not held for minutes.
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return _client;
}

export function isPostHogConfigured(): boolean {
  return !!getConfig().apiKey;
}

/**
 * Metadata stamped on EVERY backend event so logs are self-describing:
 * which service, which environment. Event-specific props (ids, model, source)
 * are merged in by the caller.
 */
export function basePostHogProps(): Record<string, unknown> {
  return {
    service: "jungle_ai",
    environment: APP_ENVIRONMENT,
  };
}

/** Run at app boot (mirror `validateOpenRouterConfig`). Warns — never throws. */
export function validatePostHogConfig(): void {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    console.warn(
      "[posthog] POSTHOG_API_KEY not set — backend/AI observability is disabled until it is configured in .env",
    );
    return;
  }
  console.log(
    `[posthog] observability configured (host ${cfg.host}, environment ${APP_ENVIRONMENT})`,
  );
}

/** Flush + close on graceful shutdown so the last batch isn't lost. */
export async function shutdownPostHog(): Promise<void> {
  if (_client) {
    try {
      await _client.shutdown();
    } catch (e) {
      console.error(
        "[posthog] shutdown flush failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
    _client = null;
  }
}
