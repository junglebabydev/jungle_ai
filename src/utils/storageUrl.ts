/**
 * Our deployment's GCS bucket, read from the single GCS_BUCKET env var. A URL is
 * only ever rewritten (signed on read, or token-stripped on write) when it points
 * at this bucket — everything else (external links, any legacy bucket from a
 * different project, unknown hosts) is left untouched. This is the
 * single source of truth shared by the write-strip and the read-signer so the
 * two stay symmetric. Returns null when GCS_BUCKET is unset.
 */
export function getOurBucket(): string | null {
  return process.env.GCS_BUCKET?.trim() || null;
}

/** True when `url` points at an object in our env-configured bucket. */
export function isOurStorageUrl(url: string): boolean {
  const parsed = parseGcsUrl(url);
  return !!parsed && parsed.bucket === getOurBucket();
}

/**
 * Parse a GCS object URL into its bucket + object key. Returns null for any URL
 * that is not a `storage.googleapis.com/<bucket>/<key>` object URL (external
 * links, Firebase download URLs, malformed values).
 */
export function parseGcsUrl(
  url: string,
): { bucket: string; objectKey: string } | null {
  const m = url.match(
    /^https?:\/\/storage\.googleapis\.com\/([^/?#]+)\/([^?#]+)/,
  );
  if (!m) return null;
  // A malformed percent-escape (e.g. "%ZZ") makes decodeURIComponent throw.
  // Never let that bubble: this runs on every request body string and every
  // response string, so a throw would 500 the request / abort response signing.
  let objectKey: string;
  try {
    objectKey = decodeURIComponent(m[2]);
  } catch {
    objectKey = m[2];
  }
  return { bucket: m[1], objectKey };
}

/**
 * Strip Google Cloud Storage V4 signing query params from a URL.
 *
 * Signed read URLs carry `?X-Goog-Algorithm=…&X-Goog-Signature=…&X-Goog-Expires=…`.
 * Those are an *ephemeral view token* — they expire (max 7 days) and must NEVER
 * be persisted. They were being saved into Product.thumbnailUrl, Location.thumbnail,
 * etc. when the frontend took a signed URL from the media API and posted it back to
 * an update endpoint. This drops the query string so only the stable, canonical
 * object URL is ever stored.
 *
 * Strips ONLY when BOTH hold: the URL points at OUR bucket (GCS_BUCKET), AND a
 * GCS signature param is present. Any other URL — an external link with a normal
 * query string, or a signed URL for a bucket we don't own — passes through
 * untouched.
 */
export function stripSignedParams(url: string): string {
  if (!url) return url;
  const q = url.indexOf("?");
  if (q === -1) return url;
  if (!isOurStorageUrl(url)) return url;
  const query = url.slice(q + 1);
  if (/(^|&)X-Goog-Signature=/.test(query) || /(^|&)X-Goog-Algorithm=/.test(query)) {
    return url.slice(0, q);
  }
  return url;
}

/**
 * Recursively apply `stripSignedParams` to every string in a payload, mutating in
 * place and returning it. This is the WRITE-side mirror of the response signer:
 * the signer hands the client signed URLs for ANY of our-bucket fields (typed or
 * freeform — e.g. LocationMedia.url, ProductMedia.url, image URLs inside website
 * `contentJson`). If the client posts one of those back, this strips the token
 * before it can reach the DB — covering every field by construction, not just the
 * ones with a per-DTO transform. Non-our-bucket / non-signed strings are unchanged.
 */
export function stripSignedParamsDeep<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return stripSignedParams(payload) as T;
  if (typeof payload !== "object") return payload;

  const seen = new WeakSet<object>(); // guard against circular references
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === "string") node[i] = stripSignedParams(v);
        else walk(v);
      }
      return;
    }
    if (node && typeof node === "object") {
      if (seen.has(node)) return;
      seen.add(node);
      const obj = node as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === "string") obj[k] = stripSignedParams(v);
        else walk(v);
      }
    }
  };
  walk(payload);
  return payload;
}
