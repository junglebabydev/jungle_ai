/**
 * The search client — booking's single point of access to the catalogue search
 * service. Booking no longer runs search itself; it asks this service over the
 * network. This module is the only place that knows the service's address, auth,
 * and endpoints, and it returns the same shapes the rest of the app already uses.
 *
 * Reads (`search`, `getCatalogueCounts`, `searchIds`) throw a typed
 * `GenericError.SearchUnavailable` (503) on any failure so a caller can react —
 * fall back to a database path, or let it propagate to a clean "search
 * temporarily unavailable" response instead of leaking transport errors. The
 * real cause (ECONNREFUSED / timeout / upstream status) is logged once here. The
 * write (`reindex`) is fire-and-forget: a search hiccup must never fail the
 * domain write it came from.
 */
import {
  SearchResponseDTO,
  StructuredSearchInput,
} from "../shared/dtos/SearchDTOs";
import { ConciergeCountsDTO } from "../shared/dtos/ConciergeDTOs";
import ApplicationError from "../errors/ApplicationError";
import { GenericError } from "../errors/domains/GenericError";

type SearchCollection = "merchants" | "products" | "packages";

/**
 * Connection settings — the "wire" between booking and the search service. These
 * env var names are shared across both services:
 *   SEARCH_ENGINE_URL        — the service's base URL
 *   SEARCH_ENGINE_API_KEY    — the shared secret (MUST equal the service's own SEARCH_ENGINE_API_KEY)
 *   SEARCH_ENGINE_TIMEOUT_MS — how long to wait before giving up on a call
 */
const config = {
  baseUrl: process.env.SEARCH_ENGINE_URL || "http://localhost:4005",
  apiKey: process.env.SEARCH_ENGINE_API_KEY || "",
  timeoutMs: Number(process.env.SEARCH_ENGINE_TIMEOUT_MS || 8000),
};

/** Auth header the service checks (see the service's adminMiddleware). */
const API_KEY_HEADER = "x-api-key";

/**
 * The service's paths — must match its route definitions (ROUTES in the search
 * service's src/shared/routes.ts). Kept here so the client↔service contract lives
 * in one obvious place on this side.
 */
const PATHS = {
  search: "/api/v1/search",
  counts: "/api/v1/search/counts",
  collectionSearch: (c: SearchCollection) => `/api/v1/collections/${c}/search`,
  collectionReindex: (c: SearchCollection, id: number | string) =>
    `/api/v1/collections/${c}/reindex/${id}`,
};

/**
 * Call the search service with auth + a timeout. On ANY failure (transport
 * error, timeout, or a non-2xx status) it logs the real cause once and throws
 * the typed `GenericError.SearchUnavailable` (503) — so callers get a clean,
 * non-leaky error to fall back on or surface, never a raw "fetch failed".
 */
async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        [API_KEY_HEADER]: config.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[search] ${method} ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
      throw GenericError.SearchUnavailable;
    }
    return (await res.json()) as T;
  } catch (e) {
    // Already the typed error from the non-2xx branch — rethrow as-is.
    if (e instanceof ApplicationError) throw e;
    // Transport failure (ECONNREFUSED / DNS / timeout-abort): log the real cause
    // once, then throw the clean typed error the rest of the app understands.
    console.warn(
      `[search] ${method} ${path} unavailable:`,
      e instanceof Error ? e.message : e,
    );
    throw GenericError.SearchUnavailable;
  } finally {
    clearTimeout(timer);
  }
}

/** Run a structured catalogue search (query term + typed filters). Throws on failure. */
async function search(
  input: StructuredSearchInput,
): Promise<SearchResponseDTO> {
  return request<SearchResponseDTO>("POST", PATHS.search, input);
}

/** Global catalogue totals (all / camps / activities). Throws on failure. */
async function getCatalogueCounts(): Promise<ConciergeCountsDTO> {
  return request<ConciergeCountsDTO>("GET", PATHS.counts);
}

/**
 * Relevance-ranked matching ids + total for one collection, for callers that
 * hydrate the rows themselves. Throws on failure so a caller with a database
 * fallback can use it.
 */
async function searchIds(
  collection: SearchCollection,
  opts: {
    q: string;
    page: number;
    pageSize: number;
    filter?: Record<string, unknown>;
    sortBy?: string;
    facetBy?: string;
  },
): Promise<{ ids: string[]; total: number }> {
  const { q, ...rest } = opts;
  return request<{ ids: string[]; total: number }>(
    "POST",
    PATHS.collectionSearch(collection),
    { q, ...rest },
  );
}

/**
 * Ask the search service to reindex one document after its source row changed.
 * Fire-and-forget: never throws — a search hiccup must not fail the domain write,
 * and the service's periodic reconcile is the backstop.
 */
async function reindex(
  collection: SearchCollection,
  id: number | string,
): Promise<void> {
  try {
    await request("POST", PATHS.collectionReindex(collection, id), {});
  } catch {
    // Non-fatal: request() already logged the real cause, and the search
    // service's periodic reconcile is the backstop. Never fail the domain write.
  }
}

export const searchClient = {
  search,
  getCatalogueCounts,
  searchIds,
  reindex,
};
