import { ServiceLocator } from "../../../services";
import { searchClient } from "../../../lib/searchClient";
import { SearchResponseDTO } from "../../../shared/dtos/SearchDTOs";
import { ConciergeScope } from "../../../shared/dtos/ConciergeDTOs";
import { MerchantResonseDTO } from "../../../shared/dtos/MerchantDTOs";
import { LocationResponseDTO } from "../../../shared/dtos/LocationDTOs";
import { LocationOperatingHrsResponseDTO } from "../../../shared/dtos/LocationOperatingHrsDTOs";
import { ProductResponseDTO } from "../../../shared/dtos/ProductDTOs";
import { spotlightToolResult } from "../../shared/guard";

/**
 * The preloaded merchant-location context: the prompt's ABOUT block + the store
 * identity (merchant + location) + the published catalogue (seeds the FE cards).
 */
export type VenueContext = {
  name?: string;
  profile?: string;
  catalog: SearchResponseDTO | null;
  /** Authoritative store identity (richer than a product's nested copy — the
   *  location lookup includes details + operating hours + media). Used to head
   *  the merchant-location "store" results. */
  merchant: MerchantResonseDTO | null;
  location: LocationResponseDTO | null;
};

/** How many of a venue's activities to preload into the guide's context block. */
const VENUE_CATALOG_SIZE = Number(process.env.CONCIERGE_VENUE_CATALOG_SIZE || 40);

// LocationOperatingHrs.day is a 1-7 integer with no day-name stored server-side
// (the FE labels it). We read it as ISO-8601: 1=Mon … 7=Sun. If the data turns
// out to use a different convention, this single array is the one place to flip.
const ISO_DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Render a venue's weekly hours compactly, collapsing consecutive days with the
 * same hours into a range ("Mon Closed; Tue–Sun 8am–5pm"). Returns null when
 * there are no usable rows.
 */
function formatHours(hrs: LocationOperatingHrsResponseDTO[]): string | null {
  const valid = hrs
    .filter((h) => h.day >= 1 && h.day <= 7)
    .sort((a, b) => a.day - b.day);
  if (!valid.length) return null;

  const norm = (s?: string | null) => {
    const t = (s ?? "").trim();
    return !t || /closed\s*-\s*closed/i.test(t) ? "Closed" : t;
  };

  const groups: { from: number; to: number; hrs: string }[] = [];
  for (const h of valid) {
    const hh = norm(h.businessHrs);
    const last = groups[groups.length - 1];
    if (last && last.hrs === hh && h.day === last.to + 1) last.to = h.day;
    else groups.push({ from: h.day, to: h.day, hrs: hh });
  }

  return groups
    .map((g) => {
      const label =
        g.from === g.to
          ? ISO_DAYS[g.from]
          : `${ISO_DAYS[g.from]}–${ISO_DAYS[g.to]}`;
      return `${label} ${g.hrs}`;
    })
    .join("; ");
}

/**
 * Build the "ABOUT <provider>" profile block — the facts the guide opens already
 * knowing about THIS venue. Everything here is parent-relevant public data
 * (who it's for, where, hours, rating, contact, booking/website/social, terms,
 * what they offer, and the published catalogue). Contact falls back location →
 * details → merchant so a parent always gets a way to reach the place. This is
 * merchant-AUTHORED free text, so the caller wraps it in untrusted-data markers.
 */
function formatVenueProfile(
  who: string,
  merchant: MerchantResonseDTO | null,
  location: LocationResponseDTO | null,
  categoryNames: string[],
  offerings: ProductResponseDTO[],
  preBooking: Map<number, PreBookingDetail>,
  catalogTotal: number,
): string {
  const lines: string[] = [
    merchant?.isVerified ? `ABOUT ${who} (a verified provider):` : `ABOUT ${who}:`,
  ];

  if (location) {
    if (location.ageMin != null && location.ageMax != null)
      lines.push(`- Who it's for: children aged ${location.ageMin}–${location.ageMax}`);

    const venueType = location.locationType
      ? `, ${location.locationType.toLowerCase()} venue`
      : "";
    const addr = [location.address, location.sgDistrict, location.sgRegion]
      .filter(Boolean)
      .join(", ");
    if (addr) lines.push(`- Where: ${addr}${venueType}`);

    if (location.gMapRating != null) {
      const reviews =
        location.reviewCount != null
          ? ` from ${location.reviewCount} Google reviews`
          : "";
      lines.push(`- Rating: ${location.gMapRating}★${reviews}`);
    }

    const hours = location.operatingHrs?.length
      ? formatHours(location.operatingHrs)
      : null;
    if (hours) lines.push(`- Opening hours: ${hours}`);

    // Contact — fall back location → details → merchant so there's always a route.
    const phone = location.phone ?? location.details?.phone ?? merchant?.contactPhone;
    const whatsApp = location.whatsApp ?? location.details?.whatsApp;
    const email = location.email ?? location.details?.email ?? merchant?.contactEmail;
    const contact = [
      phone && `phone ${phone}`,
      whatsApp && `WhatsApp ${whatsApp}`,
      email && `email ${email}`,
    ]
      .filter(Boolean)
      .join(", ");
    if (contact) lines.push(`- Contact: ${contact}`);

    if (location.details?.bookingUrl)
      lines.push(`- Book online: ${location.details.bookingUrl}`);
    const webUrl = location.details?.webUrl ?? merchant?.webUrl;
    if (webUrl) lines.push(`- Website: ${webUrl}`);

    const social = [
      location.details?.instagramUrl && `Instagram ${location.details.instagramUrl}`,
      location.details?.facebookUrl && `Facebook ${location.details.facebookUrl}`,
    ]
      .filter(Boolean)
      .join(", ");
    if (social) lines.push(`- Social: ${social}`);

    // The questions parents ask before booking. Only stated answers appear — an
    // absent line means the venue has not said, which the prompt reports honestly
    // rather than reading as a "no".
    if (location.details?.parking)
      lines.push(`- Parking: ${location.details.parking.slice(0, 200)}`);
    if (location.details?.whatToBring)
      lines.push(`- What to bring: ${location.details.whatToBring.slice(0, 200)}`);
    if (location.details?.supervisionPolicy)
      lines.push(`- Supervision: ${location.details.supervisionPolicy.slice(0, 200)}`);
    if (location.details?.amenities)
      lines.push(`- Facilities: ${location.details.amenities.slice(0, 200)}`);

    if (location.details?.termsSummary)
      lines.push(`- Good to know: ${location.details.termsSummary.slice(0, 200)}`);
    if (location.details?.description)
      lines.push(`- About: ${location.details.description.slice(0, 280)}`);
  }

  if (categoryNames.length)
    lines.push(`- Types of activities offered: ${categoryNames.slice(0, 12).join(", ")}`);

  if (offerings.length) {
    lines.push(`- Activities listed online (${catalogTotal || offerings.length}):`);
    for (const p of offerings.slice(0, VENUE_CATALOG_SIZE)) {
      const desc = p.description ? ` — ${p.description.slice(0, 90)}` : "";
      lines.push(`  • ${p.name} (${p.productType}, ages ${p.ageMin}-${p.ageMax})${desc}`);
      // "Do I need to book, or can we just turn up?" — asked of every activity, and
      // answerable for any type, so it sits on the product rather than in the
      // per-type detail block. Tri-state: an unanswered flag renders nothing.
      if (p.bookingRequired === true)
        lines.push("      – Booking ahead is required");
      else if (p.bookingRequired === false)
        lines.push("      – No need to book ahead, walk-ins welcome");
      lines.push(...preBookingLines(preBooking.get(p.id)));
    }
  } else {
    // Factual only — the "don't dead-end, pivot to the venue facts above" guidance
    // lives in the (trusted) system prompt, NOT inside this untrusted data block.
    lines.push("- Activities listed online: none yet.");
  }

  return lines.join("\n");
}

/**
 * The pre-booking answers a parent asks for before committing — what's included, how
 * long it runs, group size, cancellation terms. They exist on the per-type detail
 * models but were never loaded here, so the guide could describe a venue and then
 * decline the questions that actually decide a booking.
 *
 * Keyed by product id, and only for the two types that carry them. Best-effort: a
 * product with no detail row simply gets none, matching the rest of this preload.
 */
type PreBookingDetail = {
  whatsIncluded?: string | null;
  cancellationPolicy?: string | null;
  requiresPackage?: boolean | null;
  minKids?: number | null;
  maxKids?: number | null;
  durationMinutes?: number | null;
};

async function loadPreBookingDetails(
  offerings: ProductResponseDTO[],
): Promise<Map<number, PreBookingDetail>> {
  const wanted = offerings
    .filter(
      (product) =>
        product.productType === "BIRTHDAY" || product.productType === "DROP_IN",
    )
    .slice(0, VENUE_CATALOG_SIZE);

  const loaded = await Promise.all(
    wanted.map(async (product) => {
      try {
        const detail =
          product.productType === "BIRTHDAY"
            ? await ServiceLocator.BirthdayDetailsService.public.getBirthdayDetailsByProduct(
                product.id,
                {},
              )
            : await ServiceLocator.DropInDetailsService.public.getDropInDetailsByProduct(
                product.id,
                {},
              );
        return [product.id, detail as PreBookingDetail] as const;
      } catch {
        // No detail row for this product. The guide says "not listed" rather than
        // losing the whole ABOUT block over one missing record.
        return null;
      }
    }),
  );

  return new Map(loaded.filter((entry): entry is NonNullable<typeof entry> => !!entry));
}

/** The pre-booking lines for one activity, indented under its catalogue bullet. */
function preBookingLines(detail: PreBookingDetail | undefined): string[] {
  if (!detail) return [];
  const lines: string[] = [];
  if (detail.whatsIncluded)
    lines.push(`      – What's included: ${detail.whatsIncluded.slice(0, 220)}`);
  if (detail.durationMinutes != null)
    lines.push(`      – Runs for: ${detail.durationMinutes} minutes`);
  // Group size is load-bearing for a birthday: a per-child price is not the total
  // when a minimum number of children applies.
  if (detail.minKids != null || detail.maxKids != null) {
    const range =
      detail.minKids != null && detail.maxKids != null
        ? `${detail.minKids}–${detail.maxKids} children`
        : detail.minKids != null
          ? `minimum ${detail.minKids} children`
          : `up to ${detail.maxKids} children`;
    lines.push(`      – Group size: ${range}`);
  }
  if (detail.cancellationPolicy)
    lines.push(`      – Cancellation: ${detail.cancellationPolicy.slice(0, 220)}`);
  // Tri-state: only a stated answer is rendered. Null means the merchant has not
  // said, and no line at all is the honest representation of that.
  if (detail.requiresPackage === true)
    lines.push("      – A package must be bought to book");
  else if (detail.requiresPackage === false)
    lines.push("      – Can be paid per session, no package needed");
  return lines;
}

/**
 * VENUE CONTEXT preload (merchant-location chat). Fetches the provider profile, the
 * location (address / hours / contact / about / media), the location's activity
 * CATEGORIES (what they offer), and the PUBLISHED activity catalogue — via the
 * public `search` so it can NEVER surface unpublished products — and
 * formats a rich profile block so the guide opens already knowing the place even
 * when nothing is listed for sale yet. Best-effort: any failure degrades to a
 * leaner block (the prompt still works).
 */
export async function buildVenueContext(
  scope: ConciergeScope,
): Promise<VenueContext> {
  const merchantId = scope.merchantId;
  if (!merchantId) return { catalog: null, merchant: null, location: null };

  const [merchant, location, categories, catalog] = await Promise.all([
    ServiceLocator.MerchantService.public.getMerchantById(merchantId, {}).catch(() => null),
    scope.locationId
      ? ServiceLocator.LocationService.public
          .getLocationById(scope.locationId, {
            withDetails: true,
            withOperatingHrs: true,
            withMedia: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
    scope.locationId
      ? ServiceLocator.ProductCategoryService.public
          .listProductCategorie({ locationId: scope.locationId, merchantId }, {})
          .catch(() => [])
      : Promise.resolve([]),
    searchClient
      .search({
        query: "",
        merchantId,
        locationId: scope.locationId,
        sections: ["products"],
        pageSize: VENUE_CATALOG_SIZE,
      })
      .catch(() => null),
  ]);

  const name = merchant?.name;
  const who = name ? `“${name}”` : "this provider";
  const categoryNames = (categories ?? [])
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n));
  const offerings = catalog?.products?.data ?? [];
  // Loaded after the catalogue because it is keyed off which products came back.
  const preBooking = await loadPreBookingDetails(offerings);

  const profileText = formatVenueProfile(
    who,
    merchant ?? null,
    location ?? null,
    categoryNames,
    offerings,
    preBooking,
    catalog?.products?.total ?? 0,
  );

  // The profile is merchant-AUTHORED free text (descriptions, hours, terms, etc.).
  // Wrap it in the same <<UNTRUSTED_TOOL_DATA>> spotlight markers as tool output so
  // a malicious provider can't smuggle prompt instructions through a description —
  // the shared SECURITY rule tells the model everything inside the markers is DATA.
  return {
    name,
    profile: spotlightToolResult(profileText),
    catalog,
    merchant: merchant ?? null,
    location: location ?? null,
  };
}
