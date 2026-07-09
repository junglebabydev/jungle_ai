/**
 * CAPABILITY · TOOL-COVERAGE — proves the agent can drive every tool / dispatch
 * arm. (Was "coverage".)
 */
import { attempted, productTypesLike } from "../../engine.mjs";

// Every tool in src/ai/assistants/merchant/tools/registry.ts. Sensitive tools appear in the trace
// as gated rows, which still counts as "exercised".
const ALL_TOOLS = [
  "list_my_products", "describe_product_fields", "get_merchant", "get_location",
  "upsert_product", "upsert_pricing", "upsert_schedule", "upsert_camp_option", "get_product",
  "publish_product", "unpublish_product", "archive_product", "unarchive_product", "archive_camp_option",
  "upsert_package_template", "publish_package_template", "unpublish_package_template", "archive_package_template",
  "update_merchant", "update_location",
];

export default {
  category: "capability-tool-coverage",
  scenarios: [
    // The headline: ONE sequenced fresh-merchant journey that touches every tool.
    {
      name: "full journey — every tool in one conversation",
      autoConfirm: true,
      turns: [
        "what can I help set up here?",
        "describe what fields a CLASS product needs",
        "show me my business profile and my store location",
        "list everything I currently offer",
        "create a class called Eval Journey Class for ages 4 to 6, description 'all-tools test class', format independent, duration 45 minutes, max capacity 10",
        "yes create it",
        "add a session price named Standard of 25 dollars for SG residents",
        "yes",
        "add a recurring schedule on monday from 10:00 to 11:00 with capacity 10",
        "yes",
        "show me the full current details of Eval Journey Class",
        "change its description to 'an even more fun test class'",
        "yes",
        "publish Eval Journey Class",
        "unpublish Eval Journey Class",
        "create a membership called Eval Journey Membership priced 99 with 12 credits billed every 1 month — it's new, go ahead",
        "yes create it",
        "publish the Eval Journey Membership",
        "unpublish the Eval Journey Membership",
        "remove the Eval Journey Membership from my listings",
        "create a camp called Eval Journey Camp for ages 5 to 9, description 'all-tools camp'",
        "yes create it",
        "add a week to it called Week 1 running 2026-08-03 to 2026-08-07 from 09:00 to 14:00, capacity 15, priced 200 per week",
        "yes",
        "remove that Week 1 option from the camp",
        "yes",
        "archive Eval Journey Class",
        "restore Eval Journey Class",
        "update my GST status to registered",
        "update my location address to 2 Eval Road",
      ],
      check: ({ trace }) => {
        const seen = new Set(trace.map((t) => t.toolName));
        const missing = ALL_TOOLS.filter((w) => !seen.has(w));
        return missing.length ? [`tools never exercised: ${missing.join(", ")}`] : [];
      },
    },

    // upsert_product dispatches by type; the tool name is identical, so verify each
    // arm from the DB. (EVENT is excluded — the agent rejects it, product.ts.)
    {
      name: "product-type dispatch arms (CLASS/CAMP/BIRTHDAY/DROP_IN)",
      autoConfirm: true,
      turns: [
        "Create a class called Eval Type Class for ages 4 to 6, description 'type test', format independent, duration 30 minutes, max capacity 10.",
        "yes create it",
        "Create a camp called Eval Type Camp for ages 5 to 10, description 'type test'.",
        "yes create it",
        "Create a birthday party product called Eval Type Birthday for ages 3 to 10, description 'type test', held at our location.",
        "yes create it",
        "Create a drop-in called Eval Type DropIn for ages 2 to 5, description 'type test'.",
        "yes create it",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product")) issues.push("no product was created");
        const types = await productTypesLike("Eval Type ");
        for (const t of ["CLASS", "CAMP", "BIRTHDAY", "DROP_IN"]) {
          if (!types.has(t)) issues.push(`${t} dispatch arm not exercised (no Eval Type … ${t} product in DB)`);
        }
        return issues;
      },
    },
  ],
};
