/**
 * CAPABILITY · PRODUCT-BUILDS — full per-product-type build verticals (task
 * completion + argument/schema adherence). The CLASS path is covered in
 * onboarding; here we exercise each OTHER type's type-specific details, schedule
 * shape, and pricing vocabulary — where a weaker model most often sends the wrong
 * arg (e.g. wrong priceType, wrong package kind). (Was "lifecycle".)
 */
import { attempted, any, gatedOnce, campOptionsForCampNamed } from "../../engine.mjs";

export default {
  category: "capability-product-builds",
  scenarios: [
    // CAMP → DATE_RANGE schedule + CAMP_DAY/CAMP_WEEK pricing.
    {
      name: "camp: create → date-range schedule → day price",
      autoConfirm: true, // confirm the create so the schedule/price turns have a real product to attach to
      turns: [
        "Create a camp called Eval Camp Adventure for ages 5 to 10, description 'a fun holiday camp'.",
        "yes, create it",
        "set its dates from 2026-07-01 to 2026-07-05 with capacity 20",
        "yes",
        "price it at 60 dollars per day for SG residents",
        "yes",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "CAMP")) issues.push("CAMP not created");
        if (!attempted(trace, "upsert_schedule", (t) => t.args?.data?.scheduleType === "DATE_RANGE")) issues.push("camp schedule was not a DATE_RANGE");
        if (!attempted(trace, "upsert_pricing", (t) => ["CAMP_DAY", "CAMP_WEEK"].includes(t.args?.data?.priceType))) issues.push("camp price was not CAMP_DAY/CAMP_WEEK");
        return issues;
      },
    },

    // CAMP OPTIONS → a camp's bookable weeks/slots live in CampOption (distinct
    // from the date-range schedule). The agent must use upsert_camp_option (with
    // CAMP_DAY/CAMP_WEEK pricing), not invent a schedule, and read the options
    // back via get_product. autoConfirm lands the parked creates so we can verify
    // the CampOption rows in the DB.
    {
      name: "camp options: add bookable weeks, read them back, remove one",
      autoConfirm: true,
      turns: [
        "Create a camp called Eval Camp Options for ages 6 to 12, description 'a multi-week summer camp'.",
        "yes, create it",
        "add a week to it called Week 1 running 2026-07-06 to 2026-07-10 from 09:00 to 15:00, capacity 20, priced 250 per week",
        "yes",
        "add Week 2 running 2026-07-13 to 2026-07-17 from 09:00 to 15:00, capacity 20, priced 250 per week",
        "yes",
        "show me the Eval Camp Options camp and all its weeks",
        "remove the Week 1 option from Eval Camp Options",
        "yes",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!trace.some((t) => t.toolName === "upsert_product" && t.args?.productType === "CAMP")) issues.push("CAMP not created");
        const optCalls = trace.filter((t) => t.toolName === "upsert_camp_option");
        if (!optCalls.length) issues.push("camp weeks were not added via upsert_camp_option");
        if (!optCalls.some((t) => ["CAMP_DAY", "CAMP_WEEK"].includes(t.args?.data?.priceType))) issues.push("camp option price was not CAMP_DAY/CAMP_WEEK");
        if (!any(trace, "get_product")) issues.push("did not read the camp + options back (get_product)");
        if (!gatedOnce(trace, "archive_camp_option")) issues.push("removing a week did not invoke + gate archive_camp_option");
        // The parked option creates are auto-confirmed, so rows must exist (Week 2
        // survives after Week 1 is removed).
        const opts = (await campOptionsForCampNamed("Eval Camp Options")).filter((o) => !o.isArchived);
        if (opts.length < 1) issues.push("no live CampOption rows landed in the DB for the camp");
        return issues;
      },
    },

    // BIRTHDAY → venueType (create succeeds only if valid) + PARTY_BASE pricing.
    {
      name: "birthday: create with venue → party price",
      autoConfirm: true, // confirm the create so the price turn has a real product to attach to
      turns: [
        "Create a birthday party product called Eval Birthday Bash for ages 3 to 10, description 'a great party', held at our location.",
        "yes create it",
        "set the base party price to 300 dollars for SG residents",
        "yes",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "BIRTHDAY")) issues.push("BIRTHDAY not created (venueType likely wrong)");
        if (!attempted(trace, "upsert_pricing", (t) => ["PARTY_BASE", "PARTY_ADDON"].includes(t.args?.data?.priceType))) issues.push("birthday price was not PARTY_BASE/PARTY_ADDON");
        return issues;
      },
    },

    // DROP_IN → DROP_IN_SESSION pricing MUST include dropInUnit.
    {
      name: "drop-in: create → drop-in price with dropInUnit",
      autoConfirm: true, // confirm the create so the price turn has a real product to attach to
      turns: [
        "Create a drop-in called Eval Drop In Play for ages 2 to 5, description 'open play session'.",
        "yes create it",
        "price it at 25 dollars per kid as a drop-in session, for SG residents",
        "yes",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "DROP_IN")) issues.push("DROP_IN not created");
        if (!attempted(trace, "upsert_pricing", (t) => t.args?.data?.priceType === "DROP_IN_SESSION" && !!t.args?.data?.dropInUnit)) issues.push("drop-in price missing DROP_IN_SESSION + dropInUnit");
        return issues;
      },
    },

    // Package KINDS beyond MEMBERSHIP: TERM and SUBSCRIPTION created with the
    // right kind from merchant-given values.
    {
      name: "packages: create TERM and SUBSCRIPTION kinds",
      turns: [
        "Add a term package called Eval Term Pack priced 200 with 12 credits valid 90 days — it's new, go ahead and create it.",
        "yes create it",
        "Add a subscription called Eval Sub Monthly priced 80 billed every 1 month — it's new, create it.",
        "yes create it",
      ],
      check: ({ trace }) => {
        // Count gated creates — every write is parked, so the kind lives in the
        // gated row's args, not a non-error row.
        const kinds = new Set(
          trace.filter((t) => t.toolName === "upsert_package_template")
            .map((t) => String(t.args?.data?.kind || "").toUpperCase()),
        );
        const issues = [];
        if (!kinds.has("TERM")) issues.push("TERM package not created with kind TERM");
        if (!kinds.has("SUBSCRIPTION")) issues.push("SUBSCRIPTION package not created with kind SUBSCRIPTION");
        return issues;
      },
    },

    // Product removal + restore — the only place archive_product / unarchive_product
    // get a focused, asserted test (otherwise only the full-journey touches them).
    {
      name: "product remove then restore (archive → unarchive)",
      autoConfirm: true,
      turns: [
        "Create a class called Eval Lifecycle Removable for ages 4 to 6, independent, 30 mins, max 10.",
        "yes create it",
        "remove Eval Lifecycle Removable from my catalog",
        "yes",
        "actually restore Eval Lifecycle Removable — bring it back",
        "yes",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!gatedOnce(trace, "archive_product")) issues.push("archive_product was not invoked + gated");
        if (!gatedOnce(trace, "unarchive_product")) issues.push("unarchive_product was not invoked + gated");
        return issues;
      },
    },

    // Package hide + remove — focused test for unpublish_package_template and
    // archive_package_template (and that 'hide' uses unpublish, not delete).
    {
      name: "package hide then remove (unpublish + archive)",
      autoConfirm: true,
      turns: [
        "Add a membership called Eval Lifecycle Pkg priced 50 with 5 credits billed every 1 month — it's new, create it.",
        "yes create it",
        "publish the Eval Lifecycle Pkg membership",
        "yes",
        "hide the Eval Lifecycle Pkg membership — unpublish it, don't delete it",
        "yes",
        "now remove Eval Lifecycle Pkg for good",
        "yes",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!gatedOnce(trace, "unpublish_package_template")) issues.push("unpublish_package_template was not invoked + gated");
        if (!gatedOnce(trace, "archive_package_template")) issues.push("archive_package_template was not invoked + gated");
        return issues;
      },
    },
  ],
};
