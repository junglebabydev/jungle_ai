import { discoveryRan, productsOutOfAge, judge } from "../../engine.mjs";

/**
 * DISCOVERY · PRODUCTS — the catalogue is typed PRODUCTS: a CLASS (weekly/term
 * lesson), a DROP_IN (casual pay-as-you-go), an EVENT (one-off), a CAMP (holiday —
 * see camps.mjs), a BIRTHDAY (party package). A parent shops by what the child
 * does. This file adds the DETERMINISTIC age-band invariant (`productsOutOfAge`):
 * when an age is stated and results come back, every result's [ageMin, ageMax]
 * must include it — the server grounds `age` into a hard range filter, so this is
 * env-independent. (search.mjs probes NL phrasing breadth; this goes deeper on
 * product type + the age band.)
 *
 * Two builders keep each case to one line — question and grading together:
 *   ageCase(name, turns, age, rubric)   — search ran + judged reply, and (when the
 *     server filtered by the stated age) the deterministic age-band invariant.
 *   productCase(name, turns, age, rubric) — ageCase() with the shared products rubric.
 */

// A search ran, the reply passes `rubric`, and — when the server actually filtered by
// `age` — every result admits it. `multi` judges the LAST reply; `label` the fail note.
const ageCase = (name, turns, age, rubric, { multi = false, label = "reply" } = {}) => ({
  name,
  mode: "discovery",
  include: "products",
  turns,
  check: async ({ results, allReplies, lastReply }) => {
    const reply = multi ? lastReply : allReplies;
    const issues = discoveryRan(results, reply);
    if (age && results?.parsed?.age === age) issues.push(...productsOutOfAge(results, age));
    const v = await judge(reply, rubric);
    if (!v.pass) issues.push(`${label}: ${v.reason}`);
    return issues;
  },
});

// Convenience for the single-angle age cases: wraps the shared products rubric.
const productCase = (name, turns, age, rubric) =>
  ageCase(
    name,
    turns,
    age,
    `A concierge reply to a parent. PASS if it's a helpful, plain-language answer about the matching options (or says nothing matched / asks ONE follow-up) and does NOT dump JSON or invent prices/dates. ${rubric}`,
  );

export default {
  category: "discovery-products",
  scenarios: [
    productCase("weekly class for a young child (age band deterministic)", ["weekly swimming class for my 4 year old"], 4, "Intent: an ongoing/weekly swim class suitable for a 4 year old."),
    productCase("term-based class", ["term-based art class for my 7 year old"], 7, "Intent: a term/structured art course for a 7 year old."),
    productCase("drop-in / casual play", ["casual drop-in gym play for my 3 year old"], 3, "Intent: casual, pay-as-you-go play for a 3 year old — not a committed course."),
    productCase("one-off event / workshop", ["a one-off science workshop for my 9 year old"], 9, "Intent: a single workshop/event (not an ongoing class) for a 9 year old."),
    productCase("school-age sport", ["football for my 10 year old"], 10, "Intent: football suitable for a 10 year old."),
    productCase("teen-range activity", ["coding classes for my 14 year old"], 14, "Intent: coding suitable for a 14 year old (older child)."),
    ageCase(
      "age switch mid-conversation re-fits the results (deterministic)",
      ["swimming classes for my 3 year old", "actually he's 11"],
      11,
      "Turn 2 corrected the age to 11 (was 3). PASS if the reply now talks about swimming for an 11 year old. FAIL if it still targets a 3 year old.",
      { multi: true, label: "age not updated" },
    ),
    productCase("infant / baby class (age band deterministic)", ["baby classes for my 1 year old"], 1, "Intent: a class suitable for a 1 year old (infant/baby)."),
    productCase("lower age-boundary fit", ["gymnastics for my 2 year old"], 2, "Intent: gymnastics for a 2 year old — results must actually admit a 2yo."),
    productCase("pre-teen", ["art classes for my 12 year old"], 12, "Intent: art for a 12 year old (pre-teen)."),
    // --- additional age-fit cases ---
    productCase("toddler music + movement", ["music and movement class for my 18 month old"], 1, "Intent: a music-and-movement class for an ~18-month-old toddler."),
    productCase("nervous beginner swim", ["beginner swimming for a nervous 3 year old"], 3, "Intent: beginner swim for a nervous 3yo; take the nervousness seriously."),
    productCase("structured phonics", ["structured phonics for my 4 year old"], 4, "Intent: a structured phonics class for a 4yo."),
    productCase("junior football", ["junior football for my 5 year old"], 5, "Intent: junior football suitable for a 5yo."),
    productCase("starter ballet", ["starter ballet for my 6 year old"], 6, "Intent: beginner ballet for a 6yo."),
    productCase("group piano", ["group piano for my 7 year old"], 7, "Intent: a group piano class for a 7yo."),
    productCase("intermediate art", ["intermediate art class for my 8 year old"], 8, "Intent: an intermediate (not absolute-beginner) art class for an 8yo."),
    productCase("junior coding", ["junior coding with Scratch for my 9 year old"], 9, "Intent: beginner block/Scratch coding for a 9yo."),
    productCase("competitive gymnastics", ["competitive gymnastics for my 10 year old"], 10, "Intent: a competitive gymnastics track for a 10yo."),
    productCase("public speaking", ["public speaking for my 11 year old"], 11, "Intent: public speaking / speech for an 11yo."),
    productCase("teen robotics", ["teen robotics for my 13 year old"], 13, "Intent: robotics for a 13yo teen."),
    productCase("advanced swim squad", ["advanced swim squad for my 14 year old"], 14, "Intent: an advanced/competitive swim squad for a 14yo."),
    productCase("toddler gym play", ["toddler gym play for my 2 year old"], 2, "Intent: casual gym play for a 2yo toddler."),
    productCase("beginner drums", ["beginner drums for my 9 year old"], 9, "Intent: beginner drums for a 9yo."),
    productCase("keyboard lessons", ["keyboard lessons for my 10 year old"], 10, "Intent: keyboard lessons for a 10yo."),
    productCase("starter sport for a 12yo", ["a sport my 12 year old beginner can start now"], 12, "Intent: a beginner-friendly sport a 12yo can start now."),
    // no age assertion — the question is about suitability/coverage, not a hard filter
    ageCase("suitability question for a young child", ["is this class suitable for a 3 year old?"], null, "Parent asked if activities suit a 3 year old. PASS if it helpfully surfaces options that admit a 3yo (or asks which activity). FAIL if it dumps JSON or claims an age fit it can't know."),
    ageCase("two very different ages together", ["something for a 4 and a 6 year old to do together"], null, "Parent wants an activity a 4yo AND a 6yo can both do (or one each). PASS if the reply respects both ages. FAIL if it ignores one age."),
    ageCase("upper age boundary honesty", ["is 15 too old for your classes?"], null, "Parent asked if 15 is too old. PASS if it honestly explains what's available around that age (or that most are for younger kids) and stays helpful. FAIL if it fabricates a specific teen class as fact."),
    ageCase("art for very young kids", ["is there art for very young kids, like 2 years old?"], 2, "Parent wants art for a 2yo. PASS if it surfaces toddler-friendly art (or says none for that age). FAIL if it invents a match."),
  ],
};
