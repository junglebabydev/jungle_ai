import {
  discoveryRan,
  productsOfWrongType,
  productsOutOfAge,
  judge,
} from "../../engine.mjs";

/**
 * DISCOVERY · CAMPS — holiday camps are a PRODUCT_TYPE (CAMP) with extra angles:
 * which school-holiday window, full-day vs half-day, meals/lunch included,
 * transport/bus, multi-week. The 'Camps' category CHIP maps to a hard CAMP
 * product-type filter (server-grounded), so when we pin it we assert the type
 * DETERMINISTICALLY (`productsOfWrongType`). Free-text "holiday camp" queries are
 * judged (the model may surface camps without the chip).
 *
 * Three small builders keep each case to one line — question and grading together:
 *   chip(name, turns, {age})     — 'Camps' chip → CAMP type (+ optional age-fit)
 *   judged(name, turns, rubric)  — a search ran + a judged reply (single- or multi-turn)
 *   camp(name, turns, extra)     — judged() with the shared holiday-camp rubric
 */

const campRubric = (extra) =>
  `A parent searching for a kids' HOLIDAY CAMP. PASS if the reply is about holiday camps (or honestly says none match / it can't confirm) and stays grounded. ${extra} FAIL if it ignores the camp intent or invents specific week dates/prices.`;

// Deterministic 'Camps' chip probe: type must be CAMP; optionally assert the age band
// when the server actually filtered by it.
const chip = (name, turns, { age } = {}) => ({
  name,
  mode: "discovery",
  include: "products",
  category: ["Camps"],
  turns,
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    issues.push(...productsOfWrongType(results, "CAMP"));
    if (age && results?.parsed?.age === age) issues.push(...productsOutOfAge(results, age));
    return issues;
  },
});

// Judged probe: a search ran + the reply passes `rubric`. `multi` judges the LAST reply
// (for follow-up turns); `label` prefixes the failure note.
const judged = (name, turns, rubric, { multi = false, label = "reply" } = {}) => ({
  name,
  mode: "discovery",
  include: "products",
  turns,
  check: async ({ results, allReplies, lastReply }) => {
    const reply = multi ? lastReply : allReplies;
    const issues = discoveryRan(results, reply);
    const v = await judge(reply, rubric);
    if (!v.pass) issues.push(`${label}: ${v.reason}`);
    return issues;
  },
});

// judged() with the shared holiday-camp rubric — for the simple single-angle cases.
const camp = (name, turns, extra) => judged(name, turns, campRubric(extra));

export default {
  category: "discovery-camps",
  scenarios: [
    chip("'Camps' chip → only CAMP products (deterministic)", ["holiday programmes for my 7 year old"]),
    chip("'Camps' chip + age → CAMP and age-fit (deterministic)", ["holiday camp for my 9 year old"], { age: 9 }),
    judged(
      "free-text holiday camp query is understood",
      ["June holiday camps for my 8 year old"],
      "Parent asked for June-holiday camps for an 8 year old. PASS if the reply is about holiday camps (or says none match), grounded — not a generic class pitch, no invented dates. FAIL if it ignores the camp/holiday intent or fabricates specific week dates.",
    ),
    judged(
      "full-day camp with meals included",
      ["full day holiday camp with lunch included for my 6 year old"],
      "Parent wants a FULL-DAY camp with LUNCH/meals for a 6 year old. PASS if the reply respects the meals/full-day angle (or honestly says it can't confirm meals / none match). FAIL if it drops the meals requirement silently or invents a meal plan.",
    ),
    judged(
      "camp with transport / bus",
      ["holiday camp with bus pickup for my 7 year old"],
      "Parent wants a camp with TRANSPORT/bus pickup. PASS if the reply respects the transport angle (or says it can't confirm / none match). FAIL if it ignores it or fabricates a pickup route.",
    ),
    judged(
      "camp vs class — parent distinguishes the format (multi-turn)",
      ["weekly art classes for my 8 year old", "actually I want a holiday camp instead, not a weekly class"],
      "Turn 2 switched from a weekly CLASS to a holiday CAMP (same interest, art). PASS if the reply now talks about art CAMPS (holiday format) rather than weekly classes. FAIL if it still offers weekly classes.",
      { multi: true, label: "format not switched" },
    ),
    judged(
      "half-day camp",
      ["half day holiday camp for my 5 year old"],
      "Parent wants a HALF-DAY camp for a 5yo. PASS if the reply respects the half-day angle (or says it can't confirm / none match). FAIL if it ignores it or invents a schedule.",
    ),
    judged(
      "specific September-holiday camp",
      ["September school holiday camps for my 8 year old"],
      "Parent wants September-holiday camps. PASS if it's about holiday camps (or none match), no invented dates. FAIL if it fabricates specific week dates.",
    ),
    // --- additional camp cases (shared holiday-camp rubric) ---
    camp("March holiday camps", ["March holiday camps for my 8 year old"], "Intent: March-holiday camps."),
    camp("year-end December camps", ["year-end December camps for my 7 year old"], "Intent: December/year-end camps."),
    camp("November camp", ["November holiday camp for my 6 year old"], "Intent: a November holiday camp."),
    camp("week-long sports camp", ["week-long sports camp for my 9 year old"], "Intent: a full-week sports camp."),
    camp("June coding camp", ["coding camp for the June holidays for my 10 year old"], "Intent: a June-holiday coding camp."),
    camp("art & craft camp", ["art and craft camp for my 5 year old"], "Intent: an art/craft holiday camp for a 5yo."),
    camp("multi-activity camp", ["multi-activity camp for my 7 year old"], "Intent: a mixed/multi-activity camp."),
    camp("adventure / outdoor camp", ["adventure or outdoor camp for my 11 year old"], "Intent: an outdoor/adventure camp for an 11yo."),
    camp("full-day timing", ["camp that runs the whole week, 9am to 5pm"], "Intent: a full-day (9-5) week-long camp; respect the timing angle."),
    camp("early drop-off", ["camp with early drop-off before 9am"], "Intent: early drop-off; honest if it can't confirm."),
    camp("after-care", ["camp with after-care until 6pm"], "Intent: after-care until 6pm; honest if it can't confirm."),
    camp("two-week camp", ["two-week camp for my 8 year old"], "Intent: a two-week camp."),
    camp("drama / theatre camp", ["drama or theatre camp for my 9 year old"], "Intent: a drama/theatre camp."),
    camp("cooking camp", ["cooking camp for the school holidays"], "Intent: a holiday cooking camp."),
    camp("science camp", ["science camp for my 10 year old"], "Intent: a science holiday camp."),
    camp("swim intensive", ["swimming intensive camp during the holidays"], "Intent: a holiday swim-intensive camp."),
    camp("siblings different ages", ["one camp both my 6 and 9 year old can attend"], "Intent: a camp suiting both a 6yo and a 9yo."),
    camp("dance camp", ["dance camp for my 7 year old"], "Intent: a dance holiday camp."),
    camp("English / writing camp", ["English or writing camp for the holidays"], "Intent: an English/writing holiday camp."),
    camp("June camp in an area", ["a camp in the east for my 8 year old this June"], "Intent: a June camp in the east; keep the area."),
  ],
};
