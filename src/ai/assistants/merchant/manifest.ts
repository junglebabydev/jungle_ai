/**
 * Field manifest — the single source the assistant uses to know which fields
 * each product type / package kind needs, and which it may draft. Ported from
 * the merchant-config MCP (manifest/product-fields.ts).
 *
 * IMPORTANT: this PROMPTS the human; it does NOT validate. booking_system's
 * service layer is the validator and its missing-required list is authoritative.
 *
 * `merchantSupplied` = MUST come from the merchant verbatim — commercial values
 *   (price, capacity, dates, credits, billing) live here and are NEVER drafted.
 * `suggestable` = the assistant MAY draft these (descriptive only).
 */

import { PRICE_TYPE } from "@prisma/client";

export type FieldSpec = {
  name: string;
  note: string;
};

export type ConfigKind = {
  /** What the merchant is configuring. */
  key: string;
  /** Human label for the assistant's prompts. */
  label: string;
  /** Which booking_system entities this maps to. */
  maps: string;
  merchantSupplied: FieldSpec[];
  suggestable: FieldSpec[];
  notes?: string;
};

/** Descriptive fields the assistant may draft for ANY product type. */
const COMMON_SUGGESTABLE: FieldSpec[] = [
  { name: "name", note: "Product name" },
  { name: "description", note: "Full description" },
  { name: "highlights", note: "Short bullet highlights" },
  { name: "tags", note: "Search/category tags" },
  { name: "ageMin", note: "Minimum age (years) — confirm with merchant if unsure" },
  { name: "ageMax", note: "Maximum age (years) — confirm with merchant if unsure" },
  { name: "metaTitle", note: "SEO title" },
  { name: "metaDescription", note: "SEO description" },
];

// upsert_product takes a generic `product` block + a type-specific `details`
// block; the handler nests them. Pricing and schedule are ALWAYS separate tools
// (upsert_pricing, upsert_schedule) — never part of upsert_product.
export const PRODUCT_TYPE_FIELDS: Record<string, ConfigKind> = {
  CLASS: {
    key: "CLASS",
    label: "Class",
    maps: "upsert_product { product, details } → Product + ClassDetails",
    merchantSupplied: [
      { name: "details.format", note: "PARENT_PARTICIPATION | PARENT_ACCOMPANIED | INDEPENDENT (required)" },
      { name: "details.duration", note: "Class length in minutes (required)" },
      { name: "details.maxCapacity", note: "Max participants per session (required)" },
    ],
    suggestable: COMMON_SUGGESTABLE,
    notes:
      "upsert_product → product:{name,description,ageMin,ageMax}, details:{format,duration,maxCapacity}. THEN price via upsert_pricing (priceType SESSION/TERM/PACKAGE) and times via upsert_schedule (RECURRING). Do not put price or schedule in upsert_product.",
  },
  CAMP: {
    key: "CAMP",
    label: "Camp",
    maps: "upsert_product { product, details } → Product + CampDetails; dates+capacity via schedule; price via pricing; bookable weeks/slots via camp options (upsert_camp_option)",
    merchantSupplied: [
      { name: "schedule.rangeStartDate / rangeEndDate", note: "Camp date range — set via upsert_schedule (scheduleType=DATE_RANGE)" },
      { name: "schedule.maxCapacity", note: "Max participants — set via upsert_schedule" },
      { name: "pricing", note: `Day and/or week price — set via upsert_pricing (priceType ${PRICE_TYPE.CAMP_DAY} and/or ${PRICE_TYPE.CAMP_WEEK})` },
      { name: "campOptions (optional)", note: `Individual bookable weeks/slots — each with its own name, dates, times, capacity, and price (priceType ${PRICE_TYPE.CAMP_DAY}/${PRICE_TYPE.CAMP_WEEK}) — set via upsert_camp_option. These are what customers book.` },
    ],
    suggestable: COMMON_SUGGESTABLE,
    notes:
      `upsert_product → product:{name,description,ageMin,ageMax}, details:{} (all optional: venueAddress, mealIncluded, busIncluded). The camp has NO format/duration. Set the date range + capacity with upsert_schedule (DATE_RANGE), and day/week price with upsert_pricing (${PRICE_TYPE.CAMP_DAY}/${PRICE_TYPE.CAMP_WEEK}). Never put dates/capacity/price in upsert_product. If the camp sells individual weeks/slots, ALSO add camp options with upsert_camp_option — each option carries its own name, startDate/endDate, startTime/endTime, capacity, and price (${PRICE_TYPE.CAMP_DAY}/${PRICE_TYPE.CAMP_WEEK}); set isAvailable=false to pause one. get_product returns a camp's existing options (each with its own id) to edit, and archive_camp_option removes one.`,
  },
  BIRTHDAY: {
    key: "BIRTHDAY",
    label: "Birthday / party",
    maps: "upsert_product { product, details } → Product + BirthdayDetails; price via pricing",
    merchantSupplied: [
      { name: "details.venueType", note: "AT_HOME | AT_LOCATION | BOTH (required)" },
      { name: "pricing", note: "Base + add-on price — set via upsert_pricing (priceType PARTY_BASE / PARTY_ADDON)" },
    ],
    suggestable: COMMON_SUGGESTABLE,
    notes:
      "upsert_product → product:{name,description,ageMin,ageMax}, details:{venueType, optional minKids,maxKids,durationMinutes}. Then base + add-on price via upsert_pricing (PARTY_BASE / PARTY_ADDON).",
  },
  DROP_IN: {
    key: "DROP_IN",
    label: "Drop-in",
    maps: "upsert_product { product, details } → Product + DropInDetails; price via pricing",
    merchantSupplied: [
      { name: "pricing", note: "Per-session price — set via upsert_pricing (priceType DROP_IN_SESSION)" },
    ],
    suggestable: COMMON_SUGGESTABLE,
    notes:
      "upsert_product → product:{name,description,ageMin,ageMax}, details:{} (all optional: minKids,maxKids,whatsIncluded). Then session price via upsert_pricing (DROP_IN_SESSION); availability via upsert_schedule.",
  },
  EVENT: {
    key: "EVENT",
    label: "Event",
    maps: "(unsupported)",
    merchantSupplied: [],
    suggestable: COMMON_SUGGESTABLE,
    notes:
      "EVENT has no create route in booking_system yet — upsert_product returns it as unsupported. Tell the merchant it's not available yet.",
  },
};

export const PACKAGE_KIND_FIELDS: Record<string, ConfigKind> = {
  REGULAR: {
    key: "REGULAR",
    label: "Package",
    maps: "PackageTemplate (kind = REGULAR | TERM | TRIAL)",
    merchantSupplied: [
      { name: "kind", note: "One of REGULAR | TERM | TRIAL (exact enum value)" },
      { name: "price", note: "Package price — exact amount (required)" },
      { name: "creditsIncluded", note: "Number of credits — exact (optional)" },
      { name: "validityDays", note: "Days the package stays valid — exact (optional)" },
    ],
    suggestable: [
      { name: "name", note: "Package name" },
      { name: "description", note: "What's included, in prose" },
    ],
    notes:
      "Valid PACKAGE_KIND values: TRIAL, REGULAR, TERM, SUBSCRIPTION, MEMBERSHIP. There is no 'PACKAGE' value — use REGULAR. TERM and TRIAL share this shape with a different `kind`.",
  },
  MEMBERSHIP: {
    key: "MEMBERSHIP",
    label: "Membership",
    maps: "PackageTemplate (kind=MEMBERSHIP | SUBSCRIPTION)",
    merchantSupplied: [
      { name: "kind", note: "MEMBERSHIP or SUBSCRIPTION (exact enum value)" },
      { name: "billingPeriodMonths", note: "Billing period in months — exact" },
      { name: "price", note: "Recurring price — exact amount" },
      { name: "included", note: "What the membership includes" },
    ],
    suggestable: [
      { name: "name", note: "Membership name" },
      { name: "description", note: "Member benefits, in prose" },
    ],
    notes: "SUBSCRIPTION is the same shape with a different `kind`.",
  },
};

/**
 * PACKAGE_KIND values (and the colloquial "PACKAGE") resolve to the manifest
 * entry that documents their shape — TERM/TRIAL share REGULAR's shape,
 * SUBSCRIPTION shares MEMBERSHIP's (see each entry's notes).
 */
const KIND_ALIASES: Record<string, string> = {
  PACKAGE: "REGULAR",
  TERM: "REGULAR",
  TRIAL: "REGULAR",
  SUBSCRIPTION: "MEMBERSHIP",
};

/** Resolve a manifest entry by product type or package kind (case-insensitive). */
export function describeFields(kind: string): ConfigKind | undefined {
  const k = kind.toUpperCase();
  const key = KIND_ALIASES[k] ?? k;
  return PRODUCT_TYPE_FIELDS[key] ?? PACKAGE_KIND_FIELDS[key];
}

export const ALL_CONFIG_KINDS: string[] = [
  ...Object.keys(PRODUCT_TYPE_FIELDS),
  ...Object.keys(PACKAGE_KIND_FIELDS),
];
