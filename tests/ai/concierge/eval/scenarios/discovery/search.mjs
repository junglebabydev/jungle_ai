import { discoveryRan, judge, replyLeaks } from "../../engine.mjs";

/**
 * DISCOVERY · SEARCH — the breadth of natural-language searches a parent types into
 * the global discovery chat (no chips; the model lifts the intent into the search).
 * This is the CAPABILITY smoke set: a real query runs a search and the reply is a
 * helpful, grounded, plain-language answer that respects the stated intent
 * (activity / age / area / budget / format / day) — never a JSON dump, never a
 * fabricated specific. The seeded catalogue varies by env, so we assert the
 * CONTRACT, not specific hits.
 *
 * Each scenario is `q(name, question, rubric)` — everything for one case in one line.
 * Sibling files go DEEPER per dimension: products.mjs (types + age band), camps.mjs,
 * pricing.mjs, regions.mjs, providers.mjs, filters.mjs (chips), conversation.mjs.
 */

const grounded = (extra) =>
  `A concierge reply to a parent searching for kids' activities. PASS if it's a helpful, plain-language answer that talks about the options (or asks ONE sensible follow-up / says nothing matched) and does NOT dump raw JSON or invent specific prices/dates. ${extra}`;

// One-turn discovery case: deterministic floor (a search ran + no leak) + a judged
// reply. `mustSearch=false` for no-match probes where searching is optional.
const q = (name, turn, rubricExtra, mustSearch = true) => ({
  name,
  mode: "discovery",
  include: "products",
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = mustSearch ? discoveryRan(results, allReplies) : [];
    if (!mustSearch) {
      const leaks = replyLeaks(allReplies);
      if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
    }
    const v = await judge(allReplies, grounded(rubricExtra));
    if (!v.pass) issues.push(`reply: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-search",
  scenarios: [
    q("baseline activity + age", "swimming classes for my 5 year old", "Intent: swimming for a young child."),
    q("activity IN a district", "art classes in Tampines", "Intent: art classes located in Tampines."),
    q("activity NEAR a district", "coding classes near Bishan", "Intent: coding near Bishan (proximity)."),
    q("budget — 'cheap'", "cheap swimming classes", "Intent: affordable swimming; don't ignore the budget angle."),
    q("budget — under a number", "art classes under $200", "Intent: art classes under $200."),
    q("format — free trial", "free trial swimming", "Intent: swimming with a free trial."),
    q("format — drop-in", "drop-in art sessions", "Intent: casual drop-in art (pay per session)."),
    q("day + time", "weekend morning football", "Intent: football on weekend mornings."),
    q("amenity — with meals", "holiday camps with lunch included", "Intent: camps that include meals."),
    q("typo tolerance", "swiming lessons in tampins", "Despite typos ('swiming','tampins') it should help with swimming in Tampines, not refuse."),
    q("synonym / concept", "aquatics for my toddler", "'aquatics' should be understood as swimming/water for a toddler."),
    q(
      "multi-intent in one query (activity + age + area + budget)",
      "affordable swimming for my 6 year old near Orchard",
      "It should respect ALL of: swimming, ~age 6, near Orchard, affordable — not drop most of them.",
    ),
    {
      name: "niche — does not fabricate a match (honest no-match)",
      critical: true, // must-pass: never invents a matching class
      mode: "discovery",
      include: "products",
      turns: ["underwater hockey for a 2 year old"],
      check: async ({ allReplies }) => {
        const issues = [];
        const leaks = replyLeaks(allReplies);
        if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
        const v = await judge(
          allReplies,
          "A parent asked for a very niche activity (underwater hockey for a 2yo). PASS if the reply says it couldn't find that and offers alternatives or asks to broaden — WITHOUT inventing a fake matching class. FAIL if it fabricates a specific match.",
        );
        if (!v.pass) issues.push(`fabrication: ${v.reason}`);
        return issues;
      },
    },
    q("special needs / inclusive", "special needs friendly swimming for my 7 year old", "Intent: an inclusive / special-needs-friendly swim option; it should take the inclusion need seriously, not ignore it."),
    q("two siblings, different ages", "activities my 4 year old and 8 year old can both do", "Intent: something suiting BOTH a 4yo and an 8yo (or one for each)."),
    q("parent-and-child class", "parent and toddler music class", "Intent: a parent-accompanied class for a toddler."),
    q("competitive / advanced track", "competitive swimming squad for my 11 year old", "Intent: a competitive/advanced swim squad, not a beginner class."),
    q("girls-interest framing handled inclusively", "football for my daughter who is 9", "Intent: football for a 9yo girl — it should help with football, not refuse or gender-gatekeep."),
    q("open browse — 'what's popular'", "what are the most popular activities for young kids?", "Open browse with no single activity — it may show popular options or ask one quick question; it should not stonewall.", false),
    // --- additional everyday searches ---
    q("ballet basics", "ballet classes for my 4 year old", "Intent: beginner ballet for a young child."),
    q("martial arts", "taekwondo for my 8 year old", "Intent: taekwondo for an 8yo."),
    q("beginner piano", "piano lessons for a beginner aged 6", "Intent: beginner piano for a 6yo."),
    q("after-school club", "after-school drama club for my 9 year old", "Intent: an after-school drama club."),
    q("weekend sport slot", "Saturday afternoon basketball for my 10 year old", "Intent: basketball on Saturday afternoons."),
    q("beginner violin", "beginner violin for my 7 year old", "Intent: beginner violin for a 7yo."),
    q("early literacy", "phonics and reading classes for my 5 year old", "Intent: phonics/reading for a 5yo."),
    q("gentle intro for a shy child", "a gentle beginner activity for my shy 6 year old", "Intent: a gentle, low-pressure beginner activity for a shy 6yo; take the shyness seriously, don't ignore it."),
    q("weekend science", "weekend science experiments class for my 8 year old", "Intent: hands-on science on weekends."),
    q("language enrichment", "Mandarin enrichment for my 4 year old", "Intent: Mandarin/Chinese enrichment for a young child."),
    q("climbing", "rock climbing for kids aged 9", "Intent: rock climbing suitable for a 9yo."),
    q("cooking / baking", "cooking or baking classes for my 7 year old", "Intent: kids' cooking/baking."),
    q("chess", "chess club for my 10 year old", "Intent: a chess club for a 10yo."),
    q("dance style", "hip hop dance for my 11 year old", "Intent: hip-hop dance for an 11yo."),
    q("beginner tennis", "tennis lessons for my 8 year old beginner", "Intent: beginner tennis for an 8yo."),
    q("speech + drama", "speech and drama for a quiet 6 year old", "Intent: speech & drama; respects the child being quiet."),
    q("robotics", "robotics workshop for my 9 year old", "Intent: a robotics workshop for a 9yo."),
    q("racquet sport", "badminton coaching for my 12 year old", "Intent: badminton coaching for a 12yo."),
    q("pottery", "pottery or clay classes for my 7 year old", "Intent: pottery/clay for a 7yo."),
    q("multi-sport", "multi-sport class for an energetic 5 year old", "Intent: a varied multi-sport class for a lively 5yo."),
  ],
};
