/**
 * Shared input-shaping helpers for the agent tools — ported from the MCP's
 * tools/common.ts. These do INPUT NORMALIZATION (LLMs emit numbers as strings,
 * objects as JSON strings), NOT business validation: the booking_system Zod
 * schema + service layer remain the validator (the same way the HTTP route did).
 */

import { z, ZodError, ZodType } from "zod";
import { mapZodError } from "../../../../utils/validations/zodError";

/**
 * A positive integer id. Uses coerce because LLMs frequently emit numeric
 * values as strings (e.g. "1708") — coercion accepts those without a 400.
 */
export const id = z.coerce.number().int().positive();

/** Product types the agent can configure (mirrors the Prisma PRODUCT_TYPE enum). */
export const productTypeEnum = z.enum([
  "CLASS",
  "CAMP",
  "BIRTHDAY",
  "DROP_IN",
  "EVENT",
]);

/**
 * Known numeric fields across booking_system DTOs. LLMs frequently emit these
 * as strings ("50") — we coerce them so the schema doesn't 400. Input shaping,
 * NOT validation — the schema still validates. An allowlist keeps genuinely
 * string fields (phone, name, code, time) intact.
 */
const NUMERIC_KEYS = new Set([
  "maxCapacity", "dayOfWeek", "instructorId", "duration", "durationMinutes",
  "price", "promoPrice", "earlyBirdDiscount", "siblingsDiscount", "siblingDiscount",
  "sessionsIncluded", "validityDays", "creditsIncluded", "billingPeriodMonths",
  "ageMin", "ageMax", "categoryId", "displayOrder",
  "minKids", "maxKids", "minParents", "maxParents", "lat", "long",
  "locationId", "productId", "capacity",
]);

const DAY_OF_WEEK: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** Recursively coerce known numeric-string fields (and day names) to numbers. */
export function coerceNumericData(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(coerceNumericData);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (
        k === "dayOfWeek" &&
        typeof val === "string" &&
        DAY_OF_WEEK[val.toLowerCase()] !== undefined
      ) {
        out[k] = DAY_OF_WEEK[val.toLowerCase()];
      } else if (
        NUMERIC_KEYS.has(k) &&
        typeof val === "string" &&
        val.trim() !== "" &&
        !Number.isNaN(Number(val))
      ) {
        out[k] = Number(val);
      } else if (val && typeof val === "object") {
        out[k] = coerceNumericData(val);
      } else {
        out[k] = val;
      }
    }
    return out;
  }
  return v;
}

/**
 * Visibility/archive flags a create/update must never carry. booking_system
 * accepts them in its create/update bodies, so the agent strips them: publish
 * and archive are their own explicit, merchant-confirmed tools, never a side
 * effect of an upsert (same guardrail the MCP enforced).
 */
const VISIBILITY_FLAGS = [
  "isPublished",
  "publishedAt",
  "isPublic",
  "isArchived",
  "archivedAt",
] as const;

export function stripVisibilityFlags(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...data };
  for (const flag of VISIBILITY_FLAGS) delete out[flag];
  return out;
}

/**
 * A passthrough body object the model fills in. booking_system's Zod schema is
 * the validator — the tool handler parses this against the matching
 * Create/Update schema via `parseDto`. Accepts a JSON-string the LLM sometimes
 * emits for a nested object.
 */
export const dataPayload = z
  .preprocess((v) => {
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  }, z.record(z.string(), z.unknown()))
  .describe(
    "Body fields (an object) for booking_system to validate. Call describe_product_fields first. NEVER invent commercial values (price, dates, capacity, credits) — those come from the merchant.",
  );

/**
 * Validate `data` against a booking_system Zod schema EXACTLY as the HTTP
 * route's `validateBody` does — on failure throw the same `BR_023` ZodError so
 * the agent's missingRequired relay works identically. Returns the typed DTO.
 */
export function parseDto<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) throw mapZodError(e);
    throw e;
  }
}

/**
 * Keep only the keys the model actually sent. A `.partial()` UPDATE schema still
 * fires field `.default(...)`s for OMITTED keys (Zod v4), so the parsed object can
 * carry values the merchant never set (e.g. `isAvailable:true`, `isArchived:false`).
 * Services that merge with `?? existing` would then clobber those columns on every
 * edit. Pass the validated value through this with the RAW (pre-parse) object so
 * only the merchant-provided fields reach the update — omitted ones stay untouched.
 */
export function onlyProvided<T extends Record<string, unknown>>(
  parsed: T,
  raw: Record<string, unknown>,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(raw)) {
    if (key in parsed) out[key as keyof T] = parsed[key as keyof T];
  }
  return out;
}
