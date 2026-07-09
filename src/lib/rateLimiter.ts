/**
 * Generic, store-pluggable rate limiter.
 *
 * The algorithm lives here ONCE. Both the Express adapter
 * (`src/middleware/rateLimit.ts`) and non-HTTP callers (e.g. the WhatsApp
 * inbound worker, which has no `req`) go through `consumeRateLimit`, so every
 * limit in the codebase behaves identically.
 *
 * Scalability: the default store is in-memory (per-process → per-replica, so the
 * effective limit is N×max with N replicas). The store is behind an async
 * interface, so swapping to a SHARED store (e.g. Redis) for true cross-replica
 * limits is a one-liner — `setRateLimitStore(new RedisRateLimitStore(...))` at
 * boot — with **zero call-site changes**. The contract is already async for that
 * reason.
 */

export interface RateLimitOptions {
  /** Sliding window length in ms. */
  windowMs: number;
  /** Max hits allowed per key within the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits left in the current window after this one (0 when blocked). */
  remaining: number;
  /** Suggested wait before retrying, in ms (0 when allowed). */
  retryAfterMs: number;
}

export interface RateLimitStore {
  /** Record one hit for `key` and report whether it's within the limit. */
  hit(key: string, opts: RateLimitOptions): Promise<RateLimitResult>;
}

/**
 * Per-process sliding-window store. Holds a timestamp list per key and trims it
 * to the window on each hit. Default store until a shared one is set.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();

  async hit(
    key: string,
    { windowMs, max }: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (hits.length >= max) {
      this.buckets.set(key, hits);
      const retryAfterMs = Math.max(0, (hits[0] ?? now) + windowMs - now);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    hits.push(now);
    this.buckets.set(key, hits);

    // Opportunistic GC so the map can't grow unbounded over time.
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) {
        const live = v.filter((t) => t > cutoff);
        if (live.length === 0) this.buckets.delete(k);
        else this.buckets.set(k, live);
      }
    }

    return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 };
  }
}

let activeStore: RateLimitStore = new InMemoryRateLimitStore();

/** Swap the backing store (e.g. a Redis store for multi-replica). Call at boot. */
export function setRateLimitStore(store: RateLimitStore): void {
  activeStore = store;
}

/**
 * Consume one hit for `key` within `opts.windowMs`/`opts.max`. Callers MUST
 * namespace the key so independent limits don't share a window, e.g.
 * `ai:<userId>`, `wa-link:<userId>`, `wa-inbound:<phone>`.
 */
export function consumeRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  return activeStore.hit(key, opts);
}
