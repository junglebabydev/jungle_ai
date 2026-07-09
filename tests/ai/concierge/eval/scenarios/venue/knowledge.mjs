import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · KNOWLEDGE — the merchant-location guide must KNOW its venue and tell a
 * parent about it WITHOUT searching. `buildVenueContext` preloads the full public
 * profile — who it's for (age range), where it is, per-day opening hours, Google
 * rating + reviews, contact / booking / website / socials, terms, what it's about,
 * the activity TYPES it runs, and the catalogue — so the guide describes the place
 * even when nothing is listed for sale yet, and must never dead-end with "there's
 * nothing here".
 *
 * Every case pairs the deterministic VENUE FLOOR (`venueScopeIssues`: scope
 * confined to the pinned venue + products-only + no leak — env-independent) with an
 * advisory judge on whether the prose uses the venue facts. Rubrics assert
 * behaviour, not specific seeded values, so they hold across environments. This
 * file merges the old merchant-location / venue-knowledge / venue-merchant sets
 * into ONE place — everything "what does the guide know about this venue".
 */
const knows = (name, turns, rubric) => ({
  name,
  mode: "venue",
  turns,
  check: async ({ results, lastReply, allReplies }) => {
    const issues = venueScopeIssues(results, allReplies);
    const v = await judge(lastReply || allReplies, rubric);
    if (!v.pass) issues.push(`venue knowledge: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "venue-knowledge",
  scenarios: [
    // --- the production-critical confinement + "stays in venue" lead case ---
    {
      name: "results are confined to the pinned merchant/location (products-only)",
      critical: true, // must-pass: no cross-venue leak (scope isolation)
      mode: "venue",
      turns: ["what do you offer here for a 6 year old?"],
      check: async ({ results, allReplies }) => {
        const issues = results ? venueScopeIssues(results, allReplies) : ["no results envelope returned"];
        const v = await judge(
          allReplies,
          "A concierge for ONE specific provider, asked what they offer. PASS if it describes THIS provider's own activities and does NOT recommend other providers or tell the parent to look elsewhere / switch tabs / browse all.",
        );
        if (!v.pass) issues.push(`reply stayed-in-venue: ${v.reason}`);
        return issues;
      },
    },
    // --- describing the venue from the preloaded profile ---
    knows(
      "describes the venue concretely when asked broadly about it",
      ["tell me about this place"],
      "A concierge for ONE venue, asked to describe the place. PASS if it tells the parent concrete things about THIS venue — what kind of place it is, who it's for (ages), where it is, hours, rating, or what activities it runs. FAIL if it gives only a vague/generic capability pitch or asks a question without describing the venue at all.",
    ),
    knows(
      "never dead-ends — even with no activities it talks about the venue",
      ["what do you offer for a 5 year old?"],
      "A parent asked what a single venue offers for a 5 year old. PASS if the reply is helpful about THIS venue — either it names activities, OR (if none are listed) it still tells the parent about the place (what it is, who it's for, where, hours, or how to reach it) and invites them to enquire/visit/check back. FAIL ONLY if it dead-ends — essentially just says 'there's nothing here / no activities' and offers nothing else.",
    ),
    knows(
      "what is this place about",
      ["what's your place all about?"],
      "Asked what the venue is about. The profile has an about/description + activity types. PASS if it describes what kind of place it is and who it's for, grounded in the profile. FAIL if it gives a generic non-answer or invents a backstory unsupported by the profile.",
    ),
    knows(
      "what kinds of activities do you run",
      ["what kinds of activities or programmes do you run here?"],
      "Asked the TYPES of activities. The profile lists the activity types + catalogue. PASS if it describes the types it runs (classes/camps/drop-ins/etc.) in plain words, grounded. FAIL if it lists activity types the venue clearly doesn't have, or dead-ends.",
    ),
    // --- specific profile facts: location, hours, reputation, contact, age, terms ---
    knows(
      "where exactly is this place / address",
      ["where exactly are you located?"],
      "Asked the venue's location/address. PASS if it gives the location/area it knows (or says the exact address isn't listed and offers contact). FAIL if it invents a precise street address or says it has no idea where the venue is.",
    ),
    knows(
      "opening hours + contact",
      ["what are your opening hours and how can I contact you?"],
      "Asked the venue's opening hours and contact. PASS if it provides hours and/or a contact route (phone, WhatsApp, email, website, or booking link), OR honestly says a particular one isn't listed. FAIL if it fabricates hours/contact, or claims it can't help with venue info at all.",
    ),
    knows(
      "a specific day's opening hours",
      ["are you open on Sunday, and what time?"],
      "Asked Sunday hours specifically (the guide has per-day hours). PASS if it answers Sunday's hours (open with times, or closed), OR says hours aren't listed. FAIL if it fabricates hours or claims it can't help with hours at all.",
    ),
    knows(
      "reputation — rating and reviews",
      ["how well reviewed are you / what's your rating?"],
      "Asked about the rating/reviews (the profile carries a Google rating + review count when present). PASS if it shares the rating/reviews it has, OR says a rating isn't listed. FAIL if it invents a specific rating or review count.",
    ),
    knows(
      "contact channels — phone / WhatsApp / email / website",
      ["what's the best way to reach you — phone, WhatsApp, or email?"],
      "Asked for contact channels. PASS if it offers a real contact route it has, or honestly says a particular one isn't listed. FAIL if it fabricates a phone number/email or claims no way to make contact.",
    ),
    knows(
      "age-suitability from the venue's age range",
      ["is this place suitable for a 3 year old?"],
      "Asked whether the venue suits a 3 year old (the guide knows the served age range). PASS if it answers suitability grounded in the venue (its age range / who it's for) — yes, no, or 'best for ages X–Y'. FAIL if it ignores the venue and gives a generic non-answer, or invents an age policy.",
    ),
    knows(
      "things to know / terms / policies",
      ["is there anything I should know before coming — any policies or terms?"],
      "Asked about things-to-know / terms. PASS if it shares the venue's listed terms/things-to-know, or says none are listed and offers to connect them. FAIL if it invents a policy (e.g. a refund/cancellation rule) the profile doesn't state.",
    ),
    knows(
      "languages of instruction",
      ["what languages are your classes taught in?"],
      "Asked the languages of instruction. PASS if it answers from the profile if listed, or says it isn't listed and offers to connect them. FAIL if it invents languages.",
    ),
    knows(
      "facilities / what the place is like",
      ["what facilities do you have / what's the place like?"],
      "Asked about facilities. PASS if it describes facilities/what to expect from the profile, or says specifics aren't listed. FAIL if it fabricates facilities (e.g. a pool it never mentions).",
    ),
    knows(
      "experience / how long established",
      ["how long have you been around / are you experienced?"],
      "Asked about experience/longevity. PASS if it answers from the profile if present, or says that isn't listed and points to credentials it does have (e.g. rating). FAIL if it invents a founding year or accolades.",
    ),
  ],
};
