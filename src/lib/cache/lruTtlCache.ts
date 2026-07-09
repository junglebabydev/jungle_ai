/**
 * Generic in-process LRU cache with per-entry TTL and single-flight loading.
 *
 * Built for caching short-lived **signed storage URLs** (so an object is signed at
 * most once per window instead of on every API response), but deliberately
 * resource-agnostic so any hot, recomputable value can reuse it.
 *
 * In-memory and **per-process** by design — no external store (Redis) required.
 * Each replica keeps its own cache; that fully removes repeated signing within a
 * process. (For byte-identical URLs across replicas — so a CDN/browser can cache
 * the image bytes — pair this with deterministic signing or LB session affinity;
 * the cache interface stays the same.)
 *
 * Eviction is true **least-recently-used** (a Map preserves insertion order, and
 * reads re-insert), bounded by `max` — never clear-all, so a working set larger
 * than the cap degrades gracefully instead of dropping to a 0% hit rate.
 */
export type LruTtlCacheOptions = {
  /** Max entries before least-recently-used eviction. */
  max: number;
  /** Per-entry time-to-live, in ms. */
  ttlMs: number;
  /** Clock injection for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
};

export class LruTtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: LruTtlCacheOptions) {
    this.max = Math.max(1, Math.floor(opts.max));
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Cached value if present and unexpired (and marks it most-recently-used). */
  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() >= hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Touch: re-insert so it becomes most-recently-used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.delete(key); // ensure re-insert at the newest position
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value; // least-recently-used
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /**
   * Return the cached value, or run `loader` once to produce and cache it.
   * Concurrent misses for the same key share ONE loader call (single-flight), so
   * a cold cache or window rollover doesn't stampede the loader. A loader error
   * is NOT cached — it propagates to all current waiters and the next call retries.
   */
  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const p = (async () => {
      const value = await loader();
      this.set(key, value);
      return value;
    })();
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  get size(): number {
    return this.store.size;
  }

  /** Drop all entries (and in-flight loads). Mainly for tests / explicit resets. */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}
