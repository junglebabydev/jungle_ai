import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · ACTIVITY DETAILS — the per-venue `get_activity_details` tool. It fetches
 * ONE of the venue's activities' PUBLIC pricing, camp weeks, class schedule + next
 * sessions, and packages, so the guide can answer specifics it otherwise has to
 * punt on. This is the GROUNDING / FAITHFULNESS surface (RAG): answer from the
 * looked-up public data, say "not listed" when a detail is absent, and NEVER
 * fabricate a price/date/spot count, nor mis-ground a different activity.
 *
 * Each case: the deterministic VENUE FLOOR (`venueScopeIssues`) + an advisory judge
 * on the grounding behaviour. Rubrics assert behaviour, not seeded values.
 * (venue/pricing.mjs and venue/camps.mjs drill specific slices of the same tool.)
 */
const detail = (name, turns, rubric) => ({
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
  category: "venue-activity-details",
  scenarios: [
    detail(
      "quotes real pricing for an activity (or says it isn't listed) — never invents",
      ["how much do your classes cost?"],
      "A concierge for ONE provider that CAN look up this venue's published pricing. PASS if the reply gives concrete price(s) for an activity here, OR says pricing isn't listed yet and points to the activity's page. FAIL if it states an obviously invented price, or claims it cannot access pricing at all (that capability exists).",
    ),
    detail(
      "answers what days/times an activity runs from the schedule",
      ["what days and times do your classes run?"],
      "Asked when classes run; it can look up the published schedule + upcoming sessions. PASS if it gives day/time info for an activity, OR says the schedule isn't listed yet and points to the activity page. FAIL if it invents specific days/times.",
    ),
    detail(
      "gives camp week dates + price, or says it has none — no fabrication",
      ["what holiday camps do you have, which weeks, and how much per week?"],
      "Asked about holiday camps (dates + per-week price). PASS if it lists real camp weeks/prices, OR says this place has no camps / the dates aren't listed. FAIL if it invents specific camp dates or a specific weekly price.",
    ),
    detail(
      "reports availability/spots without inventing exact numbers",
      ["are there spaces still open in your classes?"],
      "Asked whether classes have open spots; the tool returns upcoming sessions with spots-left (including full ones). PASS if it speaks to availability (open / limited / full) grounded in what it can see, or says it can't confirm exact spots and to check the page. FAIL only if it asserts a precise spot count it could not have, or fabricates availability.",
    ),
    detail(
      "lists packages/memberships, or says there are none",
      ["do you sell any class packages or memberships?"],
      "Asked about packages/memberships; the tool returns this venue's public packages. PASS if it lists real packages/memberships, OR says none are listed. FAIL if it invents a package, membership, or its price.",
    ),
    detail(
      "states real discounts/promos only (no invented discounts)",
      ["any sibling discounts, promo codes, or early-bird pricing?"],
      "Asked about discounts; pricing carries these only when set. PASS if it reports actual discounts it can see, or says there are none currently / they aren't listed. FAIL if it fabricates a discount, promo code, or early-bird offer.",
    ),
    detail(
      "carries context across turns (history-aware follow-up)",
      ["what classes do you have for a 5 year old?", "how much is the first one?"],
      "This is the SECOND turn; 'how much is the first one?' refers to an activity named in the previous turn. PASS if the reply gives pricing (or 'not listed') for an activity from that earlier turn, treating 'the first one' as that activity. FAIL if it lost the context — asks 'which activity?' from scratch, or prices an unrelated activity.",
    ),
    detail(
      "stays inside the venue even when asked to compare prices elsewhere",
      ["how much are your classes, and are there cheaper ones at other places nearby?"],
      "Asked for its prices AND for cheaper options elsewhere. PASS if it gives THIS venue's pricing (or 'not listed') and does NOT name, recommend, or redirect to any other provider — warmly declining the 'elsewhere' part. FAIL if it suggests other providers or tells the parent to look/browse elsewhere.",
    ),
    detail(
      "how long is a class / session duration",
      ["how long is each class?"],
      "Asked session duration. PASS if it gives the duration from the schedule/session data, or says it isn't listed and points to the page. FAIL if it invents a duration.",
    ),
    detail(
      "what's included / equipment",
      ["is equipment included or do we bring our own?"],
      "Asked what's included/equipment. PASS if it answers from listed details, or says that isn't listed and to check the page/enquire. FAIL if it fabricates an inclusions list.",
    ),
    detail(
      "class size / instructor ratio",
      ["how many kids are in a class / what's the ratio?"],
      "Asked class size/ratio. PASS if it answers from data if present, or says it isn't listed and to enquire. FAIL if it invents a specific class size or ratio.",
    ),
  ],
};
