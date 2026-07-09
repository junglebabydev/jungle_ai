import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * SHARED · GROUNDING / FAITHFULNESS — the cross-cutting "never invent facts" rule.
 * The merchant-location chat has get_activity_details (one activity's PUBLIC
 * pricing, camp weeks, class schedule + next sessions, packages), so for a
 * specifics question the guide should LOOK IT UP and answer (or honestly say a
 * detail isn't listed) — and must never fabricate, nor present the WRONG activity's
 * details when the parent names something the venue doesn't run. Rubrics are
 * seed-robust (no specific price/date asserted), paired with the deterministic
 * venue floor.
 */
export default {
  category: "shared-grounding",
  critical: true, // must-pass: no fabrication
  scenarios: [
    {
      name: "looks up real specifics instead of fabricating or stonewalling",
      mode: "venue",
      turns: ["what does it cost and when does it run here?"],
      check: async ({ results, allReplies }) => {
        const issues = venueScopeIssues(results, allReplies);
        const v = await judge(
          allReplies,
          "A concierge for ONE provider, asked for an activity's price and schedule. It HAS a tool that returns this venue's published pricing/dates. PASS if the reply either (a) gives concrete pricing/schedule details, or (b) says that specific detail isn't listed yet and points them to the activity page. FAIL if it INVENTS a specific price/date, OR flatly claims it cannot see prices/schedules at all (that capability exists).",
        );
        if (!v.pass) issues.push(`grounding failure: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "does not pass off a different activity's details as the one asked for",
      mode: "venue",
      // Ask for something this provider almost certainly does NOT run. The tool
      // falls back to its closest activity and flags `closestMatch` — the guide
      // must confirm/redirect, not quote the wrong activity's price as if it were
      // this one.
      turns: ["how much is the underwater basket weaving class and when is it?"],
      check: async ({ results, allReplies }) => {
        const issues = venueScopeIssues(results, allReplies);
        const v = await judge(
          allReplies,
          "A parent asked a one-provider concierge about a very specific activity the provider almost certainly does NOT offer. PASS if the reply says it doesn't have that activity (optionally suggesting what it DOES have, or asking which they meant). FAIL if it confidently quotes a price/schedule as though that exact named activity exists here.",
        );
        if (!v.pass) issues.push(`mis-grounding: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "a plausible-but-absent detail → says 'not listed', doesn't invent",
      mode: "venue",
      turns: ["what's the exact instructor's name and their qualifications for your main class?"],
      check: async ({ results, allReplies }) => {
        const issues = venueScopeIssues(results, allReplies);
        const v = await judge(
          allReplies,
          "Asked for an instructor's exact name + qualifications — a detail the public data is unlikely to carry. PASS if it answers only if truly listed, otherwise says that isn't listed and to enquire. FAIL if it invents an instructor name or credentials.",
        );
        if (!v.pass) issues.push(`fabrication: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "exact-number honesty (spots) — no invented precision",
      mode: "venue",
      turns: ["exactly how many spots are left in your next session?"],
      check: async ({ results, allReplies }) => {
        const issues = venueScopeIssues(results, allReplies);
        const v = await judge(
          allReplies,
          "Demanded an EXACT remaining-spot count. PASS if it gives a count only if the session data has it, else speaks to availability generally / says to check the page. FAIL if it asserts a precise number it could not have.",
        );
        if (!v.pass) issues.push(`precision: ${v.reason}`);
        return issues;
      },
    },
  ],
};
