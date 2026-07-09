import { discoveryRan, productsOutOfRegions, productsOfWrongType, judge } from "../../engine.mjs";

/**
 * DISCOVERY · FILTERS — the explicit category/region CHIPS. The FE pins these
 * server-side; they OVERRIDE whatever the model infers from the message and must
 * (a) make the model SEARCH (not ask "which activity?") even on a vague message,
 * and (b) actually constrain the results. Region + the Camps chip are checked
 * DETERMINISTICALLY (`productsOutOfRegions` / `productsOfWrongType`); topic
 * categories are JUDGED (products are largely uncategorised, so the response can't
 * prove the merchant-category match).
 */
// Judged category-chip probe: the chip is selected, a search ran, and the reply
// reflects that category (or honestly says nothing matches those filters) rather
// than ignoring the chip.
const chipCase = (name, category, turn, rubric) => ({
  name,
  mode: "discovery",
  include: "products",
  category,
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    const v = await judge(
      allReplies,
      `The parent has the '${Array.isArray(category) ? category.join("/") : category}' category filter selected. PASS if the reply reflects that category (or says nothing matches those filters). ${rubric} FAIL if it ignores the filter.`,
    );
    if (!v.pass) issues.push(`category not honoured: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-filters",
  scenarios: [
    {
      name: "region chip alone constrains results to that region (deterministic)",
      mode: "discovery",
      include: "products",
      region: ["Central"],
      turns: ["activities for my 8 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["Central"]));
        return issues;
      },
    },
    {
      name: "multiple region chips: every result is in one of them",
      mode: "discovery",
      include: "products",
      region: ["Central", "East"],
      turns: ["swimming"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["Central", "East"]));
        return issues;
      },
    },
    {
      name: "'Anywhere' imposes no region constraint (still searches)",
      mode: "discovery",
      include: "products",
      region: "Anywhere",
      turns: ["swimming"],
      check: async ({ results, allReplies }) => discoveryRan(results, allReplies),
    },
    {
      name: "vague message + chips still searches (no clarifying-question dead-end)",
      mode: "discovery",
      include: "products",
      category: ["Swim", "Dance"],
      region: ["Central", "East"],
      turns: ["activities for my 8 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["Central", "East"]));
        const v = await judge(
          allReplies,
          "A parent with category + area filters already selected asked vaguely for 'activities for my 8 year old'. PASS if the reply presents matching options (or says none match those filters). FAIL if it only asks which activity/area — those are already selected.",
        );
        if (!v.pass) issues.push(`dead-ended on chips: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "category chip narrows to that activity (judged)",
      mode: "discovery",
      include: "products",
      category: "Swim",
      turns: ["what do you have for a 6 year old?"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "A parent selected the 'Swim' category chip and asked what's available for a 6 year old. PASS if the reply is about swimming (or says no swimming for that age). FAIL if it talks about unrelated activities as though no filter were set.",
        );
        if (!v.pass) issues.push(`category not honoured: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "category + region combined (region deterministic, topic judged)",
      mode: "discovery",
      include: "products",
      category: ["Coding"],
      region: ["West"],
      turns: ["anything good?"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["West"]));
        const v = await judge(
          allReplies,
          "Coding category + West region selected, vague message. PASS if the reply is about coding in the west (or says none match). FAIL if it ignores the filters.",
        );
        if (!v.pass) issues.push(`combined filter: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "chips override a contradictory message (chips win)",
      mode: "discovery",
      include: "products",
      category: ["Art & craft"],
      turns: ["swimming lessons"],
      check: async ({ allReplies }) => {
        const v = await judge(
          allReplies,
          "The parent typed 'swimming lessons' but has the 'Art & craft' chip selected (the chip is the authoritative filter). PASS if the reply reflects Art & craft (art options, or notes there's no swimming under art & craft / asks about the mismatch). FAIL if it just returns swimming as though the chip didn't exist.",
        );
        return v.pass ? [] : [`chip not authoritative: ${v.reason}`];
      },
    },
    {
      name: "'Camps' chip maps to the CAMP product type (deterministic)",
      mode: "discovery",
      include: "products",
      category: ["Camps"],
      turns: ["holiday options for my 7 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOfWrongType(results, "CAMP"));
        return issues;
      },
    },
    {
      name: "'Birthdays' chip maps to the BIRTHDAY product type (deterministic)",
      mode: "discovery",
      include: "products",
      category: ["Birthdays"],
      turns: ["something for my child's birthday party"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOfWrongType(results, "BIRTHDAY"));
        return issues;
      },
    },
    {
      name: "'Indoor play' chip is honoured (judged)",
      mode: "discovery",
      include: "products",
      category: ["Indoor play"],
      turns: ["somewhere for my 3 year old to play"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "'Indoor play' chip selected. PASS if the reply is about indoor play options (or says none match). FAIL if it ignores the indoor-play intent.",
        );
        if (!v.pass) issues.push(`indoor play: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "three category chips OR-ed together still searches",
      mode: "discovery",
      include: "products",
      category: ["Swim", "Dance", "Music"],
      turns: ["what's good for my 6 year old?"],
      check: async ({ results, allReplies }) => discoveryRan(results, allReplies),
    },
    // --- additional filter cases ---
    chipCase("'Music' chip → 6yo", "Music", "what do you have for a 6 year old?", "About music."),
    chipCase("'Dance' chip → 8yo", "Dance", "anything for my 8 year old?", "About dance."),
    chipCase("'Football' chip → active 10yo", "Football", "something active for my 10 year old", "About football / an active sport."),
    chipCase("'Art & craft' chip → beginner 5yo", "Art & craft", "for a beginner aged 5", "About art & craft."),
    chipCase("'Coding' chip → 9yo", "Coding", "for my 9 year old", "About coding."),
    {
      name: "'Swim' + East chip → for a 7yo (region deterministic, swim judged)",
      mode: "discovery",
      include: "products",
      category: ["Swim"],
      region: ["East"],
      turns: ["for my 7 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["East"]));
        const v = await judge(allReplies, "Swim + East selected for a 7yo. PASS if it's about swimming in the east (or none match). FAIL if it ignores the filters.");
        if (!v.pass) issues.push(`combined filter: ${v.reason}`);
        return issues;
      },
    },
    chipCase("'Gymnastics' chip → near me", "Gymnastics", "near me", "About gymnastics."),
    {
      name: "West region chip alone → activities for an 8yo (deterministic)",
      mode: "discovery",
      include: "products",
      region: ["West"],
      turns: ["activities for my 8 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["West"]));
        return issues;
      },
    },
    {
      name: "'Camps' chip → June holidays (deterministic CAMP)",
      mode: "discovery",
      include: "products",
      category: ["Camps"],
      turns: ["for the June holidays"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOfWrongType(results, "CAMP"));
        return issues;
      },
    },
    {
      name: "'Birthdays' chip → party ideas (deterministic BIRTHDAY)",
      mode: "discovery",
      include: "products",
      category: ["Birthdays"],
      turns: ["party ideas for my 6 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOfWrongType(results, "BIRTHDAY"));
        return issues;
      },
    },
    chipCase("'Indoor play' chip → rainy weekend", "Indoor play", "for a rainy weekend", "About indoor play."),
    chipCase("'STEM' chip → 4yo", "STEM", "for my 4 year old", "About STEM / enrichment."),
    {
      name: "two area chips (North + North-East) → swimming (deterministic)",
      mode: "discovery",
      include: "products",
      region: ["North", "North-East"],
      turns: ["swimming"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["North", "North-East"]));
        return issues;
      },
    },
    {
      name: "'Music' + Central chip → piano for a 7yo (region deterministic)",
      mode: "discovery",
      include: "products",
      category: ["Music"],
      region: ["Central"],
      turns: ["piano for my 7 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["Central"]));
        const v = await judge(allReplies, "Music + Central selected, asked for piano for a 7yo. PASS if it's about music/piano in Central (or none match). FAIL if it ignores the filters.");
        if (!v.pass) issues.push(`combined filter: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "'Anywhere' + coding for a 9yo still searches",
      mode: "discovery",
      include: "products",
      region: "Anywhere",
      turns: ["coding for my 9 year old"],
      check: async ({ results, allReplies }) => discoveryRan(results, allReplies),
    },
    chipCase("'Outdoor' chip beats typed 'art'", "Outdoor", "art please", "The Outdoor chip is authoritative — it should reflect outdoor activities, not silently switch to art."),
    {
      name: "three activity chips → what's good for a 6yo",
      mode: "discovery",
      include: "products",
      category: ["Swim", "Music", "Art & craft"],
      turns: ["what's good for my 6 year old?"],
      check: async ({ results, allReplies }) => discoveryRan(results, allReplies),
    },
    chipCase("'Cooking' chip → 9yo", "Cooking", "for my 9 year old", "About cooking."),
    {
      name: "area chip + vague 'something fun' still shows options",
      mode: "discovery",
      include: "products",
      region: ["East"],
      turns: ["something fun"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["East"]));
        const v = await judge(allReplies, "An area filter is set and the parent said 'something fun'. PASS if it presents options in that area (or says none match). FAIL if it only asks which area — it's already selected.");
        if (!v.pass) issues.push(`dead-ended: ${v.reason}`);
        return issues;
      },
    },
    chipCase("'Mandarin' chip → 8yo", "Mandarin", "beginner class for my 8 year old", "About Mandarin enrichment."),
  ],
};
