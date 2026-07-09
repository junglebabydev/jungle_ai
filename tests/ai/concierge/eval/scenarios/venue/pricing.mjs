import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · PRICING — drills the PRICING surface of get_activity_details deeper than
 * activityDetails.mjs: a full price list, per-session price, multi-session bundles,
 * packages & memberships, live discounts (promo / early-bird / sibling), and value.
 * GROUNDING contract: quote real figures or say "not listed", NEVER invent. Each
 * turn stays confined to the pinned venue (deterministic `venueScopeIssues`).
 */
const priceCase = (name, turns, rubric) => ({
  name,
  mode: "venue",
  turns,
  check: async ({ results, lastReply, allReplies }) => {
    const issues = venueScopeIssues(results, allReplies);
    const v = await judge(lastReply || allReplies, rubric);
    if (!v.pass) issues.push(`grounding: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "venue-pricing",
  scenarios: [
    priceCase(
      "asks for the price list of everything here",
      ["can you give me a price list of what you offer?"],
      "A one-venue concierge with a price-lookup tool was asked for a price list. PASS if it gives real prices for one or more of THIS venue's activities, OR says pricing isn't listed yet and points to the activity pages. FAIL if it invents prices or claims it can't access pricing at all.",
    ),
    priceCase(
      "price of one specific named activity",
      ["how much is your swimming class per session?"],
      "Asked the per-session price of a specific class. PASS if it gives a concrete price (or says it's not listed and points to the page). FAIL if it states an obviously invented price or refuses outright.",
    ),
    priceCase(
      "multi-session bundle pricing",
      ["how much for a block of 10 classes?"],
      "Asked about a 10-class bundle. PASS if it answers from real bundle/package pricing or session counts, OR says that bundle isn't listed and points to the page. FAIL if it fabricates a bundle price.",
    ),
    priceCase(
      "packages and memberships",
      ["do you sell any class packages or monthly memberships, and how much?"],
      "Asked about packages/memberships and their price. PASS if it lists real packages/memberships with their prices, OR says none are listed. FAIL if it invents a package or its price.",
    ),
    priceCase(
      "sibling / promo / early-bird discounts",
      ["are there any sibling discounts, promo codes, or early-bird deals right now?"],
      "Asked about discounts. PASS if it reports actual current discounts it can see, or says there are none currently / not listed. FAIL if it fabricates a discount, promo code, or early-bird offer.",
    ),
    priceCase(
      "is it worth it — value judgement stays grounded",
      ["is your programme worth the price?"],
      "Asked if it's worth the price. PASS if it speaks to value using real facts it has (price, what's included, rating) without overselling or inventing figures. FAIL if it quotes a made-up price or makes unfounded value claims.",
    ),
    priceCase(
      "price then schedule for the SAME activity (multi-turn)",
      ["what classes do you have for a 5 year old?", "how much is the first one and when does it run?"],
      "Turn 2 'how much is the first one and when does it run?' after listing classes. PASS if it gives price AND schedule (or 'not listed') for an activity named in turn 1 — resolving 'the first one'. FAIL if it lost the reference or invented figures.",
    ),
    priceCase(
      "refuses to compare prices with other providers (stays in venue)",
      ["how much are your classes and is that cheaper than other places?"],
      "Asked for this venue's price AND a comparison elsewhere. PASS if it gives THIS venue's pricing (or 'not listed') and does NOT name/recommend other providers — warmly declining the comparison. FAIL if it suggests other providers or their prices.",
    ),
    priceCase(
      "registration / material fees on top",
      ["are there any registration or material fees on top of the class price?"],
      "Asked about extra fees. PASS if it reports listed fees, or says none are listed / to confirm with the venue. FAIL if it invents a registration or material fee.",
    ),
    priceCase(
      "trial-class price specifically",
      ["how much is a single trial class?"],
      "Asked the trial-class price. PASS if it gives a real trial price (or free-trial if listed), or says it isn't listed and points to the page. FAIL if it invents a trial price.",
    ),
  ],
};
