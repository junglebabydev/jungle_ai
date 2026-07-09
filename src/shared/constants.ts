import z from "zod";
import { SG_REGIONS } from "@prisma/client";

export const API_ROUTE_PREFIX = {
  V1: "/api/v1",
};
export const AUTH_TOKEN_PREFIX = {
  BEARER: "Bearer ",
};

/**
 * Canonical activity-category chips the parent-facing CONCIERGE product search
 * offers — the SOURCE OF TRUTH for the category vocabulary.
 *
 * Kept here as a constant (NOT a Prisma enum) ON PURPOSE: Prisma only generates an
 * enum into `@prisma/client` when a model field references it, and these
 * categories are not (and should not be) a column on any table — so a standalone
 * `enum ACTIVITY_CATEGORY` would never be importable in code. Hence the constant.
 *
 * How each chip is used (grounded in `unified-search/categoryVocabulary.ts`):
 *  - the 10 TOPIC categories (Art & craft … Gymnastics) filter products by the
 *    merchant's category — an exact Typesense facet on `merchantCategories`,
 *    mirroring the merchant search's `categories:=` filter;
 *  - the 4 OVERLAP chips map to existing facets so a category never duplicates a
 *    type/location filter: Camps→PRODUCT_TYPE.CAMP, Birthdays→PRODUCT_TYPE.BIRTHDAY,
 *    Indoor play→LOCATION_TYPE.INDOOR, Outdoor→LOCATION_TYPE.OUTDOOR.
 * Both `category` and `region` are multi-value (any-of). Order here is the chip
 * display order.
 */
export const ACTIVITY_CATEGORIES = [
  "Art & craft",
  "Music",
  "Dance",
  "Football",
  "Swim",
  "Coding",
  "Mandarin",
  "STEM",
  "Indoor play",
  "Cooking",
  "Outdoor",
  "Gymnastics",
  "Camps",
  "Birthdays",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Jungle Explorer Map developmental trails and their parent-facing themes. */
export const TRAILS = [
  "Physical",
  "Cognitive",
  "Creative",
  "Social",
] as const;
export type Trail = (typeof TRAILS)[number];

export const TRAIL_THEMES: Record<Trail, string> = {
  Physical: "Body & Movement",
  Cognitive: "Curiosity & Discovery",
  Creative: "Imagination & Expression",
  Social: "People & Heart",
};

export type CategoryTrailDefinition = {
  primary: Trail;
  alsoBuilds: readonly Trail[];
};

/**
 * Authoritative Explorer Map mapping for catalogue subcategories. These names
 * match the real ProductCategory vocabulary stored in the database.
 */
export const EXPLORER_MAP_SUBCATEGORY_TRAIL_MAP: Record<
  string,
  CategoryTrailDefinition
> = {
  "Sports": { primary: "Physical", alsoBuilds: ["Social"] },
  "Dance": { primary: "Physical", alsoBuilds: ["Creative"] },
  "Martial Arts": { primary: "Physical", alsoBuilds: ["Social"] },
  "Wellness": { primary: "Physical", alsoBuilds: ["Social"] },
  "Play Spaces": { primary: "Physical", alsoBuilds: ["Social"] },
  "Tech & Science": { primary: "Cognitive", alsoBuilds: [] },
  "Museums & Science Centres": { primary: "Cognitive", alsoBuilds: [] },
  "Nature": { primary: "Cognitive", alsoBuilds: ["Physical"] },
  "Music": { primary: "Creative", alsoBuilds: [] },
  "Arts & Crafts": { primary: "Creative", alsoBuilds: [] },
  "Performing Arts": { primary: "Creative", alsoBuilds: ["Social"] },
  "Languages": { primary: "Creative", alsoBuilds: ["Cognitive"] },
  "Life Skills": { primary: "Social", alsoBuilds: ["Cognitive"] },
};

/**
 * Search-chip projection of the Explorer Map's authoritative subcategory table.
 * Camps and Birthdays are formats, not developmental activities, so their
 * underlying activity category supplies the trail instead of inventing one.
 */
export const ACTIVITY_CATEGORY_TRAIL_MAP: Partial<
  Record<ActivityCategory, CategoryTrailDefinition>
> = {
  "Art & craft": { primary: "Creative", alsoBuilds: [] },
  "Music": { primary: "Creative", alsoBuilds: [] },
  "Dance": { primary: "Physical", alsoBuilds: ["Creative"] },
  "Football": { primary: "Physical", alsoBuilds: ["Social"] },
  "Swim": { primary: "Physical", alsoBuilds: [] },
  "Coding": { primary: "Cognitive", alsoBuilds: [] },
  "Mandarin": { primary: "Creative", alsoBuilds: ["Cognitive"] },
  "STEM": { primary: "Cognitive", alsoBuilds: [] },
  "Indoor play": { primary: "Physical", alsoBuilds: ["Social"] },
  "Cooking": { primary: "Social", alsoBuilds: ["Cognitive"] },
  "Outdoor": { primary: "Cognitive", alsoBuilds: ["Physical"] },
  "Gymnastics": { primary: "Physical", alsoBuilds: [] },
};

/** Common search words that identify a canonical activity chip. */
export const ACTIVITY_CATEGORY_QUERY_TERMS: Partial<
  Record<ActivityCategory, readonly string[]>
> = {
  "Art & craft": ["art", "arts and crafts", "craft", "crafts"],
  "Music": ["music", "piano", "violin"],
  "Dance": ["dance", "dancing", "ballet"],
  "Football": ["football", "soccer"],
  "Swim": ["swim", "swimming", "aquatics"],
  "Coding": ["coding", "code", "programming"],
  "Mandarin": ["mandarin"],
  "STEM": ["stem", "robotics", "science"],
  "Indoor play": ["indoor play", "indoor playground"],
  "Cooking": ["cooking", "baking"],
  "Outdoor": ["outdoor", "outdoor play"],
  "Gymnastics": ["gymnastics"],
};

/**
 * Plain-language signals parents use when they describe an outcome instead of
 * naming an activity. These infer search intent only; they never assess a child.
 */
export const EXPLORER_MAP_TRAIL_INTENT_TERMS: Record<
  Trail,
  readonly string[]
> = {
  Physical: [
    "physical",
    "active",
    "movement",
    "moving",
    "running",
    "climbing",
    "energetic",
    "body stuff",
  ],
  Cognitive: [
    "cognitive",
    "curiosity",
    "curious",
    "discovery",
    "discovering",
    "how things work",
    "building things",
  ],
  Creative: [
    "creative",
    "creativity",
    "imagination",
    "imaginative",
    "expression",
    "expressive",
    "making up stories",
    "performing",
  ],
  Social: [
    "social",
    "teamwork",
    "team work",
    "friendship",
    "make friends",
    "other kids",
    "other children",
    "confidence with others",
    "people and teamwork",
  ],
};

/**
 * Region chips for the concierge search — DERIVED from the Prisma `SG_REGIONS`
 * enum (the source of truth for real regions, which already includes `SOUTH`), so
 * adding/removing a region in the schema flows here automatically. We only add the
 * synthetic "Anywhere" chip in front (= no region preference; dropped at grounding).
 * Enum values render as friendly labels (`NORTH_EAST` → "North-East"); the
 * grounding (`normalizeSearchRegions`) reverses that and validates membership
 * against `SG_REGIONS`, so "Anywhere"/unknown values simply broaden the search.
 */
const regionChipLabel = (region: string): string =>
  region
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join("-");

export const SEARCH_REGIONS: string[] = [
  "Anywhere",
  ...Object.values(SG_REGIONS).map(regionChipLabel),
];

export const TimeStringSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Time must be in HH:MM 24 hour format, for example 09:30 or 18:05",
  );

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toSeconds = (t: string) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

export const PERMISSIONS_MAP = {
  LOCATION_READ: {
    code: "location.read",
    description: "Read location(s)",
  },
  LOCATION_CREATE: {
    code: "location.create",
    description: "Create a location",
  },
  LOCATION_UPDATE: {
    code: "location.update",
    description: "Update a location",
  },

  MERCHANT_CREATE: {
    code: "merchant.create",
    description: "Create a merchant",
  },
  MERCHANT_READ: {
    code: "merchant.read",
    description: "Read merchant details",
  },
  MERCHANT_UPDATE: {
    code: "merchant.update",
    description: "Update merchant details",
  },

  USER_MERCHANT_OWNER_CREATE: {
    code: "user.merchant_owner.create",
    description: "Create merchant business owner user",
  },
  USER_MERCHANT_ADMIN_CREATE: {
    code: "user.merchant_admin.create",
    description: "Create merchant admin user",
  },
  USER_LOCATION_ADMIN_CREATE: {
    code: "user.location_admin.create",
    description: "Create location admin user",
  },
  USER_LOCATION_STAFF_CREATE: {
    code: "user.location_staff.create",
    description: "Create location staff/instructor",
  },

  USER_ME_READ: {
    code: "user.me.read",
    description: "Read logged in user",
  },
  USER_READ: {
    code: "user.read",
    description: "Read any user by id",
  },
  USER_PLATFORM_ROLE_UPDATE: {
    code: "user.platform_role.update",
    description: "Update a user's platform role",
  },
  LOCATION_USER_DELETE: {
    code: "location-user.delete",
    description: "Hard-delete a LocationUser membership row",
  },

  PRODUCT_CATEGORY_CREATE: {
    code: "product-category.create",
    description: "Create a product category",
  },
  PRODUCT_CATEGORY_UPDATE: {
    code: "product-category.update",
    description: "Update a product category",
  },
  PRODUCT_CREATE: {
    code: "product.create",
    description: "Create a product",
  },
  PRODUCT_UPDATE: {
    code: "product.update",
    description: "Update a product",
  },
  AI_CHAT: {
    code: "ai.chat",
    description: "Use the AI merchant-config chat assistant",
  },
  WHATSAPP_LINK: {
    code: "whatsapp.link",
    description: "Link a WhatsApp number to a merchant",
  },
  AI_EVAL_CREATE: {
    code: "ai-eval.create",
    description: "Store an AI security evaluation report",
  },
  AI_EVAL_READ: {
    code: "ai-eval.read",
    description: "Read stored AI security evaluation reports",
  },

  PRICING_CREATE: {
    code: "pricing.create",
    description: "Create a pricing",
  },
  PRICING_UPDATE: {
    code: "pricing.update",
    description: "Update a pricing",
  },

  SCHEDULE_CREATE: {
    code: "schedule.create",
    description: "Create schedule for a product",
  },
  SCHEDULE_UPDATE: {
    code: "schedule.update",
    description: "Update a schedule",
  },

  CLASS_SESSION_READ: {
    code: "session.read",
    description: "Read sessions",
  },
  CLASS_SESSION_CREATE: {
    code: "session.create",
    description: "Create a session",
  },
  CLASS_SESSION_CANCEL: {
    code: "session.cancel",
    description: "Create a session",
  },

  PACKAGE_TEMPLATE_CREATE: {
    code: "package-template.create",
    description: "Create a package template",
  },
  PACKAGE_TEMPLATE_UPDATE: {
    code: "package-template.update",
    description: "Update a package template",
  },
  PACKAGE_TEMPLATE_DELETE: {
    code: "package-template.delete",
    description: "Delete a package template",
  },

  REGISTRATION_READ: {
    code: "registration.read",
    description: "Read a registration by id",
  },
  REGISTRATION_CREATE: {
    code: "registration.create",
    description: "Create registration",
  },
  REGISTRATION_UPDATE: {
    code: "registration.update",
    description: "Update a registration",
  },

  PACKAGE_READ: {
    code: "package.read",
    description: "Read a package",
  },

  STUDENT_CREATE: {
    code: "student.create",
    description: "Create a student",
  },
  STUDENT_READ: {
    code: "student.read",
    description: "Read a student",
  },
  STUDENT_UPDATE: {
    code: "student.update",
    description: "Update a student",
  },

  BOOKING_READ: {
    code: "booking.read",
    description: "Read booking(s)",
  },

  PAYMENT_READ: {
    code: "payment.read",
    description: "Read payment records for a merchant",
  },

  SESSION_ENROLLMENT_CREATE: {
    code: "session-enrollment.create",
    description: "Read session enrollments",
  },
  SESSION_ENROLLMENT_READ: {
    code: "session-enrollment.read",
    description: "Read session enrollments",
  },
  SESSION_ENROLLMENT_UPDATE: {
    code: "session-enrollment.update",
    description: "Read session enrollments",
  },

  ATTENDANCE_READ: {
    code: "attendance.read",
    description: "Read attendance",
  },
  MARK_ATTENDANCE: {
    code: "attendance.mark",
    description: "Mark attendance",
  },

  PACKAGE_CREDIT_READ: {
    code: "package-credit.read",
    description: "Read package credit",
  },
  PACKAGE_CREDIT_CREATE: {
    code: "package-credit.create",
    description: "Create package credit",
  },

  BIRTHDAY_REQUEST_READ: {
    code: "birthday-request.read",
    description: "Read birthday request(s)",
  },
  BIRTHDAY_REQUEST_UPDATE: {
    code: "birthday-request.update",
    description: "Update a birthday request",
  },

  DROP_IN_REQUEST_READ: {
    code: "drop-in-request.read",
    description: "Read drop in request(s)",
  },
  DROP_IN_REQUEST_UPDATE: {
    code: "drop-in-request.update",
    description: "Update a drop in request",
  },

  // Stripe Connect
  CONNECT_READ: {
    code: "connect.read",
    description: "View Stripe Connect status for a merchant",
  },
  CONNECT_MANAGE: {
    code: "connect.manage",
    description:
      "Start Stripe Connect onboarding and access the Express dashboard",
  },

  // Jungle SaaS Billing (merchant -> Jungle subscription)
  BILLING_MANAGE: {
    code: "billing.manage",
    description:
      "Subscribe to a Jungle SaaS plan, open the SaaS billing portal, view subscription status",
  },

  // Merchant Website Builder
  WEBSITE_READ: {
    code: "website.read",
    description: "Read the merchant's website config and draft tree",
  },
  WEBSITE_UPDATE: {
    code: "website.update",
    description:
      "Update the merchant's website draft tree (config, sections, chrome)",
  },
  WEBSITE_PUBLISH: {
    code: "website.publish",
    description: "Publish the merchant's website (snapshot draft to live)",
  },

  // Merchant Media Library (uploads panel)
  MERCHANT_MEDIA_CREATE: {
    code: "merchant-media.create",
    description: "Upload a file to the merchant's media library",
  },
  MERCHANT_MEDIA_READ: {
    code: "merchant-media.read",
    description: "Read/list the merchant's media library",
  },
  MERCHANT_MEDIA_DELETE: {
    code: "merchant-media.delete",
    description: "Delete a file from the merchant's media library",
  },

  // Blog Media (super-admin only — jungle-blogs bucket)
  BLOG_MEDIA_CREATE: {
    code: "blog-media.create",
    description: "Upload media to the blog (jungle-blogs) bucket",
  },
};

export const PERMISSION_LIST = Object.values(PERMISSIONS_MAP);
