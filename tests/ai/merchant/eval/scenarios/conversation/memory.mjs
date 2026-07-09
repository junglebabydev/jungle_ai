/**
 * CONVERSATION · MEMORY — multi-turn coherence. Real merchants say "it" / "that
 * one" / "the first one" and refine earlier values. These assert the agent
 * resolves references to the RIGHT product across turns, doesn't stack refinements,
 * and reads fresh on recall rather than answering from chat memory.
 */
import { ok, any, attempted, gatedOnce, realIdOnly, merchantProductIds, activeProductCountByName } from "../../engine.mjs";

export default {
  category: "conversation-memory",
  scenarios: [
    // Coreference: "publish it" must resolve to the product just created — a
    // gated publish on an OWNED id (not a hallucinated/foreign one).
    {
      name: "coreference: 'publish it' resolves to the new product",
      autoConfirm: true, // the create must land so "publish it" can resolve to a real, owned id
      turns: [
        "Create a class called Eval Memory Coref, ages 4 to 6, independent, 30 mins, max 10.",
        "yes create it",
        "great, now publish it",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "CLASS")) issues.push("product not created");
        if (!gatedOnce(trace, "publish_product")) issues.push("'it' did not resolve to a publishable product (no gated publish)");
        issues.push(...realIdOnly(trace, ["publish_product"], await merchantProductIds())); // resolved to an OWNED id
        return issues;
      },
    },

    // Refinement: a corrected value must not spawn duplicates. With every write
    // confirmed, the duplicate-create guard (server-side) blocks a re-create of an
    // already-confirmed product — so however the (weaker) model phrases it, exactly
    // ONE active "Eval Memory Refine" may exist afterwards.
    {
      name: "refinement: corrected age replaces the earlier value",
      autoConfirm: true,
      turns: [
        "I want to add a class called Eval Memory Refine for ages 4 to 6, independent, 30 mins, max 10.",
        "actually make it ages 3 to 5",
        "yes create it",
      ],
      check: async ({ trace }) => {
        const issues = [];
        if (!attempted(trace, "upsert_product", (t) => t.args?.productType === "CLASS")) issues.push("no CLASS create attempted");
        const n = await activeProductCountByName("Eval Memory Refine");
        if (n === 0) issues.push("no product was created");
        if (n > 1) issues.push(`left ${n} active "Eval Memory Refine" copies — the duplicate-create guard did not prevent the duplicate`);
        return issues;
      },
    },

    // Follow-up: after a list, "tell me more about the first one" must resolve to
    // a real product and read it (a successful get_product, not a NF on a guess).
    {
      name: "follow-up: 'the first one' after a list reads a real product",
      turns: [
        "list my products",
        "tell me more about the first one",
      ],
      check: ({ trace }) => {
        const issues = [];
        if (!any(trace, "list_my_products")) issues.push("did not list");
        if (!ok(trace, "get_product")) issues.push("'the first one' did not resolve to a real product (no successful get_product)");
        return issues;
      },
    },

    // Recall: asked for a value set earlier, the agent must READ FRESH
    // (get_product), not answer from conversation memory.
    {
      name: "recall: reads fresh for a previously-set price",
      autoConfirm: true, // create + price must land so the recall has something to read fresh
      turns: [
        "Create a class Eval Memory Recall, ages 4 to 6, independent, 30 mins, max 10.",
        "yes create it",
        "add a session price named Standard of 33 dollars for SG residents",
        "yes",
        "remind me — what price did I set for Eval Memory Recall?",
      ],
      check: ({ trace }) =>
        any(trace, "get_product") ? [] : ["answered a 'what price' recall from memory instead of reading fresh (no get_product)"],
    },
  ],
};
