/**
 * CAPABILITY · ONBOARDING — a freshly-signed merchant sets up from scratch.
 *
 * Focused vertical slices (each its own conversation) so a failure points at one
 * stage. The full sequenced "every tool" journey lives in tool-coverage.mjs.
 */
import { attempted, any, gatedOnce, productByName, merchantRow } from "../../engine.mjs";

export default {
  category: "capability-onboarding",
  scenarios: [
    // Orientation + business profile. The GST status comes FROM the merchant and
    // must be applied; the agent never invents it.
    {
      name: "orientation + business profile",
      autoConfirm: true, // confirm the parked update_merchant so the GST change lands in the DB
      turns: [
        "Hi! I just signed up for jungle.baby and my account is empty. What can you help me set up?",
        "My business is called Eval Sprout Studio, we are GST registered, and our contact email is hello@evalsprout.test.",
        "yes, please save that",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "update_merchant")) issues.push("business profile was not saved (update_merchant)");
        const m = await merchantRow();
        if (m && m.gstRegistered !== true) issues.push("merchant-supplied GST status was not applied");
        return issues;
      },
    },

    // Address is a LOCATION field — must route to update_location, not the profile.
    {
      name: "store location",
      turns: ["Set my studio's address to 10 Eval Avenue, Singapore 100100."],
      check: ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "update_location")) issues.push("address not saved via update_location");
        if (!any(trace, "update_location") && any(trace, "update_merchant")) issues.push("used update_merchant for an address (a location field)");
        return issues;
      },
    },

    // The full first-product vertical, nothing → LIVE: describe → create → price →
    // schedule → read back → publish. Publish must be PARKED (gated), then the
    // auto-confirmed click must actually flip isPublished=true in the DB.
    {
      name: "first class end-to-end to live",
      autoConfirm: true,
      turns: [
        "What fields do I need to add a class?",
        "Here are the details for a class I'd like to add — name Eval Onboarding Ballet, ages 3 to 5, description 'a gentle intro to ballet', format independent, duration 45 minutes, max capacity 10.",
        "yes, go ahead and create it",
        "add a session price named Standard of 28 dollars for SG residents",
        "yes",
        "add a recurring schedule on saturday from 09:00 to 10:00 with capacity 10",
        "yes",
        "show me the full details of Eval Onboarding Ballet",
        "publish it",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!any(trace, "describe_product_fields")) issues.push("did not consult describe_product_fields");
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "CLASS")) issues.push("CLASS draft not created");
        if (!attempted(trace, "upsert_pricing")) issues.push("session price not added");
        if (!attempted(trace, "upsert_schedule")) issues.push("schedule not added");
        if (!any(trace, "get_product")) issues.push("did not read back full details (get_product)");
        if (!gatedOnce(trace, "publish_product")) issues.push("publish was not parked for confirmation");
        const p = await productByName("Eval Onboarding Ballet");
        if (!p) issues.push("product missing from DB");
        else if (!p.isPublished) issues.push("confirmed publish did NOT set isPublished=true");
        return issues;
      },
    },

    // Create a membership (package template) from merchant-given values and take
    // it live through the package publish gate.
    {
      name: "create a membership package",
      autoConfirm: true, // confirm the create so the membership exists for the publish turn
      turns: [
        "Add a membership called Eval Onboarding Gold priced 120 with 10 credits billed every 1 month — it's brand new, go ahead and create it.",
        "yes create it",
        "now publish the Eval Onboarding Gold membership",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_package_template", (t) => String(t.args?.data?.kind || "").toUpperCase() === "MEMBERSHIP")) issues.push("membership not created with kind MEMBERSHIP");
        if (!gatedOnce(trace, "publish_package_template")) issues.push("package publish was not parked for confirmation");
        return issues;
      },
    },
  ],
};
