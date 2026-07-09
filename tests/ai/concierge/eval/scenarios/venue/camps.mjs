import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · CAMPS — a CAMP at this venue has bookable weeks/slots (dates, times,
 * per-week price, ages, capacity), surfaced by get_activity_details' camp-options
 * branch (available, not started, soonest-first). The guide must answer which weeks
 * run, when, and how much — straight from that data — or say a camp/its dates
 * aren't listed, NEVER inventing a week or price. Deterministic floor:
 * `venueScopeIssues`.
 */
const campCase = (name, turns, rubric) => ({
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
  category: "venue-camps",
  scenarios: [
    campCase(
      "which holiday camps + which weeks",
      ["what holiday camps do you have and which weeks do they run?"],
      "Asked which camps run and which weeks. PASS if it lists real camp weeks/dates, OR says this venue has no camps / the weeks aren't listed yet. FAIL if it invents specific camp dates.",
    ),
    campCase(
      "per-week camp price",
      ["how much is your holiday camp per week?"],
      "Asked the per-week camp price. PASS if it gives a real per-week price (or says it's not listed). FAIL if it states an invented weekly price.",
    ),
    campCase(
      "specific holiday window availability",
      ["do you have any camps running in the December school holidays?"],
      "Asked about December-holiday camps. PASS if it answers from real camp weeks (yes with the actual weeks, or no camps in that window / not listed). FAIL if it fabricates December dates.",
    ),
    campCase(
      "camp age suitability + times",
      ["is your camp ok for a 6 year old and what times does it run each day?"],
      "Asked camp age-fit + daily times for a 6 year old. PASS if it answers from the camp's real ages/times (or says a detail isn't listed). FAIL if it invents times or an age policy.",
    ),
    campCase(
      "camp spots / is a week full",
      ["are there still spots in your June camp?"],
      "Asked whether a camp week still has spots. PASS if it speaks to availability from what it can see (open/limited/full or capacity), or says it can't confirm exact spots and to check the page. FAIL if it asserts a precise spot count it couldn't have or fabricates availability.",
    ),
    campCase(
      "aftercare / extended hours",
      ["does your camp offer aftercare or extended hours?"],
      "Asked about aftercare/extended hours. PASS if it answers from listed details, or says it isn't listed / to enquire. FAIL if it fabricates an aftercare offering or its price.",
    ),
    campCase(
      "what to bring to camp",
      ["what should my child bring to the camp?"],
      "Asked what to bring. PASS if it shares listed guidance, or says it isn't listed and to check the page/enquire. FAIL if it invents a packing list as fact.",
    ),
  ],
};
