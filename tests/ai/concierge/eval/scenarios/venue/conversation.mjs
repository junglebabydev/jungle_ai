import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · CONVERSATION (multi-turn) — the merchant-location guide must hold context
 * across turns within ONE venue: resolve "the first one" / "it" to an activity it
 * named earlier, follow up on type/price/schedule, and answer about/hours/booking
 * — all while staying confined to the pinned venue (deterministic `venueScopeIssues`)
 * and never redirecting out. The CONVERSATION dimension (context retention + role
 * adherence) for the per-venue surface.
 */
const turnCase = (name, turns, rubric, useLast = true) => ({
  name,
  mode: "venue",
  turns,
  check: async ({ results, lastReply, allReplies }) => {
    const issues = venueScopeIssues(results, allReplies);
    const v = await judge(useLast ? lastReply : allReplies, rubric);
    if (!v.pass) issues.push(`context: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "venue-conversation",
  scenarios: [
    turnCase(
      "drill from 'what do you offer' into the first activity's price",
      ["what do you offer here?", "how much is the first one?"],
      "Turn 1 listed activities, turn 2 'how much is the first one?'. PASS if it gives the price (or 'not listed') for an activity it named in turn 1 — resolving the reference. FAIL if it asks 'which one?' from scratch.",
    ),
    turnCase(
      "age suggestion then a type follow-up",
      ["anything for a 4 year old?", "is that a class or a camp?"],
      "Turn 1 suggested something for a 4yo, turn 2 'is that a class or a camp?'. PASS if it answers the TYPE of the activity from turn 1. FAIL if it lost the reference.",
    ),
    turnCase(
      "about → hours → booking, all from the venue profile",
      ["tell me about this place", "what are your opening hours?", "how do I book?"],
      "Turn 3 'how do I book?' after about + hours. PASS if it gives a booking route (link/contact) or says to enquire — grounded in this venue. FAIL if it sends elsewhere or invents a booking flow.",
    ),
    turnCase(
      "stays in-venue when pushed to compare prices elsewhere",
      ["what swimming do you have?", "is it cheaper anywhere else?"],
      "Turn 2 asks if it's cheaper elsewhere. PASS if it stays on THIS provider (doesn't name/redirect to others), warmly. FAIL if it recommends another provider or says to look elsewhere.",
      false,
    ),
    turnCase(
      "follow-up pronoun 'when does it run' resolves to the prior activity",
      ["do you have art classes?", "when does it run?"],
      "Turn 2 'when does it run?' after asking about art classes. PASS if it gives the schedule (or 'not listed') for that art class — resolving 'it'. FAIL if it asks which activity.",
    ),
    turnCase(
      "list → pick the second one → ask to book",
      ["what classes do you have?", "tell me more about the second one", "how do I sign up for it?"],
      "Turn 3 'how do I sign up for it?' after drilling into the second listed class. PASS if it gives a booking route for that specific class — grounded in this venue. FAIL if it loses which class or invents a flow.",
    ),
    turnCase(
      "age correction mid-venue re-targets suggestions",
      ["what do you have for a 7 year old?", "sorry he's actually 3"],
      "Turn 2 corrects the age to 3. PASS if it now suggests what suits a 3yo at THIS venue (or says nothing suits a 3yo here). FAIL if it still targets a 7yo.",
    ),
  ],
};
