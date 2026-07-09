import { z } from "zod";
import {
  PRODUCT_TYPE,
  SCHEDULE_STATUS,
  SESSION_STATUS,
} from "@prisma/client";
import { ServiceLocator } from "../../../../services";
import { searchClient } from "../../../../lib/searchClient";
import { ProductResponseDTO } from "../../../../shared/dtos/ProductDTOs";
import { PricingResponseDTO } from "../../../../shared/dtos/PricingDTOs";
import { CampOptionResponseDTO } from "../../../../shared/dtos/CampOptionDTOs";
import { ScheduleResponseDTO } from "../../../../shared/dtos/ScheduleDTOs";
import { SessionResponseDTO } from "../../../../shared/dtos/SessionDTOs";
import { PackageTemplateResponseDTO } from "../../../../shared/dtos/PackageTemplateDTOs";
import { ConciergeTool, ConciergeToolContext } from "./types";

/** How many candidates to pull when resolving an activity NAME → product within
 *  the pinned venue (small: one venue has few activities). */
const RESOLVE_LIMIT = Number(process.env.CONCIERGE_ACTIVITY_RESOLVE_LIMIT || 10);
/** Cap on each detail list (camp options / upcoming sessions) fed to the model —
 *  keeps the tool result token-bounded; the FE booking page shows the full set. */
const LIST_LIMIT = Number(process.env.CONCIERGE_DETAIL_LIST_LIMIT || 8);

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ActivityDetailsToolInput = z.object({
  activity: z
    .string()
    .describe(
      "The NAME of the ONE activity at this venue the parent is asking specifics about, exactly (or as close as possible) as it appears in your catalogue — e.g. \"Tots Swim\", \"March Holiday Art Camp\". One activity per call.",
    ),
});

const isoDate = (d: Date): string => new Date(d).toISOString().slice(0, 10);

/** An active promo: priced, started (or no start), and not yet expired. */
function activePromo(p: PricingResponseDTO, now: Date) {
  if (p.promoPrice == null) return undefined;
  if (p.promoStartDate && new Date(p.promoStartDate) > now) return undefined;
  if (p.promoEndDate && new Date(p.promoEndDate) < now) return undefined;
  return { promoPrice: p.promoPrice, ...(p.promoCode ? { promoCode: p.promoCode } : {}) };
}

/** An early-bird discount whose deadline hasn't passed. */
function activeEarlyBird(p: PricingResponseDTO, now: Date) {
  if (p.earlyBirdDiscount == null) return undefined;
  if (p.earlyBirdDeadline && new Date(p.earlyBirdDeadline) < now) return undefined;
  return {
    earlyBirdDiscount: p.earlyBirdDiscount,
    ...(p.earlyBirdDeadline ? { earlyBirdDeadline: isoDate(p.earlyBirdDeadline) } : {}),
  };
}

function compactPricing(pricing: PricingResponseDTO[], now: Date) {
  // `listPricingByProduct({ onlyPublic: true })` already returns only public,
  // non-archived rows, so everything here is parent-visible by construction.
  return pricing.map((p) => ({
    name: p.name,
    price: p.price,
    priceType: p.priceType,
    ...(p.sessionsIncluded ? { sessionsIncluded: p.sessionsIncluded } : {}),
    ...(p.validityDays ? { validityDays: p.validityDays } : {}),
    ...activePromo(p, now),
    ...activeEarlyBird(p, now),
    ...(p.siblingDiscount ? { siblingDiscount: p.siblingDiscount } : {}),
  }));
}

/** A camp's bookable weeks/slots: available, not removed, and not already
 *  started — mirrors the search index's camp visibility (an option you can still
 *  join), soonest first. */
function compactCampOptions(options: CampOptionResponseDTO[], now: Date) {
  return options
    .filter((o) => o.isAvailable && !o.isArchived && new Date(o.startDate) >= now)
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
    .slice(0, LIST_LIMIT)
    .map((o) => ({
      name: o.name,
      startDate: isoDate(o.startDate),
      endDate: isoDate(o.endDate),
      startTime: o.startTime,
      endTime: o.endTime,
      ...(o.price != null ? { price: o.price } : {}),
      ...(o.ageMin != null && o.ageMax != null
        ? { ages: `${o.ageMin}-${o.ageMax}` }
        : {}),
      ...(o.capacity != null ? { capacity: o.capacity } : {}),
    }));
}

function summarizeSchedule(s: ScheduleResponseDTO) {
  const term = s.termName
    ? {
        term: {
          name: s.termName,
          ...(s.termStartDate ? { start: isoDate(s.termStartDate) } : {}),
          ...(s.termEndDate ? { end: isoDate(s.termEndDate) } : {}),
        },
      }
    : {};
  const full = s.status === SCHEDULE_STATUS.FULL ? { full: true } : {};
  if (s.scheduleType === "FIXED_DATE") {
    return {
      ...(s.specificDate ? { date: isoDate(s.specificDate) } : {}),
      startTime: s.specificStartTime ?? undefined,
      endTime: s.specificEndTime ?? undefined,
      ...term,
      ...full,
    };
  }
  if (s.scheduleType === "DATE_RANGE") {
    return {
      ...(s.rangeStartDate ? { startDate: isoDate(s.rangeStartDate) } : {}),
      ...(s.rangeEndDate ? { endDate: isoDate(s.rangeEndDate) } : {}),
      startTime: s.startTime ?? undefined,
      endTime: s.endTime ?? undefined,
      ...term,
      ...full,
    };
  }
  // RECURRING (default)
  return {
    ...(s.dayOfWeek != null ? { day: DAY_NAMES[s.dayOfWeek] } : {}),
    startTime: s.startTime ?? undefined,
    endTime: s.endTime ?? undefined,
    ...term,
    ...full,
  };
}

/** The live recurring/dated patterns for a class: published and not draft/
 *  cancelled. FULL is kept (a real, published class that's just fully booked) —
 *  the model can tell the parent it's full rather than claim it doesn't exist. */
function compactSchedules(schedules: ScheduleResponseDTO[]) {
  return schedules
    .filter(
      (s) =>
        s.isPublished &&
        (s.status === SCHEDULE_STATUS.ACTIVE || s.status === SCHEDULE_STATUS.FULL),
    )
    .map(summarizeSchedule);
}

/** The next few concrete sessions a parent could attend: future (queried with
 *  `from: now`), not cancelled/completed. FULL sessions are surfaced with
 *  `spotsLeft: 0` / `full: true` rather than hidden. */
function compactSessions(sessions: SessionResponseDTO[]) {
  return sessions
    .filter(
      (s) =>
        !s.isCancelled &&
        s.status !== SESSION_STATUS.CANCELLED &&
        s.status !== SESSION_STATUS.COMPLETED,
    )
    .sort((a, b) => +new Date(a.sessionDate) - +new Date(b.sessionDate))
    .slice(0, LIST_LIMIT)
    .map((s) => ({
      date: isoDate(s.sessionDate),
      startTime: s.startTime,
      endTime: s.endTime,
      spotsLeft: s.availableSlots,
      ...(s.availableSlots <= 0 || s.status === SESSION_STATUS.FULL
        ? { full: true }
        : {}),
    }));
}

function compactPackages(packages: PackageTemplateResponseDTO[]) {
  return packages
    .filter((p) => p.isPublic && !p.isArchived)
    .map((p) => ({
      name: p.name,
      kind: p.kind,
      price: p.price,
      ...(p.creditsIncluded ? { credits: p.creditsIncluded } : {}),
      ...(p.validityDays ? { validityDays: p.validityDays } : {}),
      ...(p.billingPeriodMonths ? { billingMonths: p.billingPeriodMonths } : {}),
    }));
}

type ResolvedActivity = {
  product: ProductResponseDTO;
  /** True only when the parent's text actually matched the product NAME (exact
   *  or contained either way). False ⇒ we fell back to the top-ranked search hit,
   *  which may NOT be the activity they meant. */
  nameMatched: boolean;
};

/**
 * Resolve the activity NAME → a product within the pinned venue using the SAME
 * scope-pinned, published `search` the search tool uses. This inherits
 * the published + venue gate (an unpublished or out-of-venue activity simply
 * isn't found) and keeps internal ids away from the model. Prefers an exact name
 * match, then a contained match (either direction); only THEN falls back to the
 * top-ranked hit — flagged `nameMatched:false` so the caller can tell the model
 * the result is a best-guess (e.g. "yoga" at a swim school must not be answered
 * as if it were the swim class).
 */
async function resolveProduct(
  activity: string,
  ctx: ConciergeToolContext,
): Promise<ResolvedActivity | null> {
  const res = await searchClient.search({
    query: activity,
    merchantId: ctx.scope?.merchantId,
    locationId: ctx.scope?.locationId,
    sections: ["products"],
    pageSize: RESOLVE_LIMIT,
  });
  const candidates = res.products?.data ?? [];
  if (!candidates.length) return null;

  const lc = activity.trim().toLowerCase();
  const byName = lc
    ? candidates.find((p) => p.name?.toLowerCase() === lc) ??
      candidates.find((p) => {
        const name = p.name?.toLowerCase() ?? "";
        return name.includes(lc) || lc.includes(name);
      })
    : undefined;

  if (byName) return { product: byName, nameMatched: true };
  return { product: candidates[0], nameMatched: false };
}

async function runActivityDetails(args: unknown, ctx: ConciergeToolContext) {
  const parsed = ActivityDetailsToolInput.safeParse(args);
  const activity = parsed.success ? parsed.data.activity.trim() : "";

  const resolved = await resolveProduct(activity, ctx);
  if (!resolved) {
    return {
      forModel: {
        found: false,
        message: `I couldn't find an activity matching “${activity}” here. Tell me the name as it's listed and I'll pull the details.`,
      },
    };
  }

  const { product, nameMatched } = resolved;
  const productId = product.id;
  const isCamp = product.productType === PRODUCT_TYPE.CAMP;
  const now = new Date();

  // Hydrate only the PUBLIC, parent-relevant slices, branched by type so a class
  // doesn't query camp options and vice versa. Each is best-effort — a missing
  // slice degrades to empty rather than failing the whole lookup.
  const [pricing, packages, campDetails, schedules, sessions] = await Promise.all([
    ServiceLocator.PricingService.public
      .listPricingByProduct(productId, { onlyPublic: true })
      .catch(() => [] as PricingResponseDTO[]),
    ServiceLocator.PackageTemplateService.public
      .listPackageTemplatesByProduct(productId, {})
      .catch(() => [] as PackageTemplateResponseDTO[]),
    isCamp
      ? ServiceLocator.CampDetailsService.public
          .getCampDetailsByProduct(productId, { withOptions: true })
          .catch(() => null)
      : Promise.resolve(null),
    isCamp
      ? Promise.resolve([] as ScheduleResponseDTO[])
      : ServiceLocator.ScheduleService.public
          .listSchedulesByProduct(productId, {})
          .catch(() => [] as ScheduleResponseDTO[]),
    isCamp
      ? Promise.resolve([] as SessionResponseDTO[])
      : ServiceLocator.SessionService.public
          .listSessionsByProduct(productId, { from: now }, {})
          .catch(() => [] as SessionResponseDTO[]),
  ]);

  const prices = compactPricing(pricing, now);
  const campOptions = campDetails
    ? compactCampOptions(campDetails.options ?? [], now)
    : [];
  const schedule = compactSchedules(schedules);
  const upcomingSessions = compactSessions(sessions);
  const packs = compactPackages(packages);

  return {
    forModel: {
      found: true,
      // The parent's words didn't match this activity's NAME — it's the closest
      // thing the venue has, NOT necessarily what they asked for. The model must
      // confirm ("did you mean …?") before quoting these specifics.
      ...(nameMatched ? {} : { closestMatch: true }),
      activity: {
        name: product.name,
        type: product.productType,
        ages: `${product.ageMin}-${product.ageMax}`,
      },
      ...(prices.length ? { pricing: prices } : {}),
      ...(campOptions.length ? { campOptions } : {}),
      ...(schedule.length ? { schedule } : {}),
      ...(upcomingSessions.length ? { upcomingSessions } : {}),
      ...(packs.length ? { packages: packs } : {}),
      // Tell the model what's genuinely empty so it states that plainly instead
      // of inventing a price or date.
      ...(!prices.length && !campOptions.length && !packs.length
        ? { note: "No public pricing is listed for this activity yet." }
        : {}),
    },
    // The detail lookup doesn't search, so leave the FE cards as they are.
    cards: undefined,
  };
}

/**
 * `get_activity_details` — the per-activity drill-down for the merchant-location
 * (scoped) chat ONLY. Surfaces ONE of the venue's activities' PUBLIC pricing,
 * camp options, class schedule + next sessions, and packages. Everything it
 * returns is published/public; see the per-slice predicates above (which mirror
 * the search index's visibility, including keeping FULL items visible).
 */
export const getActivityDetailsTool: ConciergeTool = {
  name: "get_activity_details",
  scopedOnly: true,
  definition: {
    type: "function",
    function: {
      name: "get_activity_details",
      description:
        "Look up the EXACT public details of ONE of THIS venue's activities by name: its current pricing (with any promo / early-bird / sibling discounts), a CAMP's bookable weeks (dates, times, price), a CLASS's schedule and its next few sessions (with how many spots are left), and any packages or memberships. Everything returned is published and public — answer the parent straight from it. If a section is absent from the result, that detail simply isn't listed yet — say so, NEVER invent a price, date, or time. If the result has `closestMatch: true`, the name did NOT match — it's the nearest activity this venue has, so CONFIRM which one the parent meant (\"did you mean …?\") before quoting its specifics. Use this whenever a parent asks about cost, fees, dates, when it runs, available spots, packages, or memberships for a specific activity.",
      parameters: z.toJSONSchema(ActivityDetailsToolInput),
    },
  },
  run: runActivityDetails,
};
