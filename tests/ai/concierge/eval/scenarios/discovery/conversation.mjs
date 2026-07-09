import { searched, productsOutOfRegions, replyLeaks, judge } from "../../engine.mjs";

/**
 * DISCOVERY · CONVERSATION (multi-turn) — the chat must carry context across turns:
 * refinements ("any cheaper?", "what about the east?"), age/day tweaks, topic
 * switches, and "show me more" — each BUILDING on the prior turn rather than
 * restarting. This is the CONVERSATION dimension (context retention + role
 * adherence): we judge the LAST reply (the one that needs the history) and add
 * deterministic checks where the carried context is observable (e.g. region stays
 * put).
 */
const lastTurnCheck = (rubric) => async ({ results, lastReply, allReplies }) => {
  const issues = searched(results) ? [] : ["no search ran on the follow-up turn"];
  const leaks = replyLeaks(allReplies);
  if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
  const v = await judge(lastReply, rubric);
  if (!v.pass) issues.push(`context: ${v.reason}`);
  return issues;
};

export default {
  category: "discovery-conversation",
  scenarios: [
    {
      name: "refine by budget keeps the activity + age from turn 1",
      mode: "discovery",
      include: "products",
      turns: ["swimming classes for my 6 year old", "any cheaper ones?"],
      check: lastTurnCheck(
        "Turn 2 'any cheaper ones?' after asking about SWIMMING for a 6yo. PASS if the reply stays on swimming (cheaper/cheapest swimming) — carrying the activity + age. FAIL if it asks 'cheaper what?' or switches activity.",
      ),
    },
    {
      name: "refine by area carries the activity",
      mode: "discovery",
      include: "products",
      turns: ["art classes", "any in the east?"],
      check: lastTurnCheck(
        "Turn 2 'any in the east?' after 'art classes'. PASS if it returns ART in the east (activity carried). FAIL if it asks 'east what?' or drops art.",
      ),
    },
    {
      name: "refine by age carries the activity + area",
      mode: "discovery",
      include: "products",
      turns: ["coding classes in Jurong", "for a 5 year old"],
      check: lastTurnCheck(
        "Turn 2 'for a 5 year old' after 'coding in Jurong'. PASS if it returns coding in Jurong for a 5yo (both carried). FAIL if it forgot coding or Jurong.",
      ),
    },
    {
      name: "topic switch replaces the activity",
      mode: "discovery",
      include: "products",
      turns: ["swimming for my kid", "actually, piano instead"],
      check: lastTurnCheck(
        "Turn 2 'actually, piano instead' after swimming. PASS if it now talks about PIANO (switched). FAIL if it still pushes swimming.",
      ),
    },
    {
      name: "'any others?' continues the same search",
      mode: "discovery",
      include: "products",
      turns: ["swimming classes", "any others?"],
      check: lastTurnCheck(
        "Turn 2 'any others?' after swimming. PASS if it offers MORE swimming options / acknowledges showing additional swimming results — the same search continued. FAIL if it restarts or asks what activity.",
      ),
    },
    {
      name: "area stays sticky across a budget refine (deterministic + judged)",
      mode: "discovery",
      include: "products",
      turns: ["swimming in the east", "any cheaper?"],
      check: async ({ results, lastReply }) => {
        const issues = [];
        // "East" here is free-text (not a server-pinned chip), so only assert the
        // region invariant when the server ACTUALLY applied an East filter on this
        // turn (`parsed.region` echoes what ran); otherwise the judged check below
        // carries the "area sticky" signal.
        const pr = results?.parsed?.region;
        const regs = Array.isArray(pr) ? pr : pr ? [pr] : [];
        if (regs.some((r) => String(r).toUpperCase() === "EAST"))
          issues.push(...productsOutOfRegions(results, ["East"]));
        const v = await judge(
          lastReply,
          "Turn 2 'any cheaper?' after 'swimming in the east'. PASS if the cheaper results stay swimming in the EAST (area persisted). FAIL if it dropped the east.",
        );
        if (!v.pass) issues.push(`area not sticky: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "three-turn deepening keeps the thread",
      mode: "discovery",
      include: "products",
      turns: ["swimming for my 6 year old", "in the east", "and on weekends"],
      check: lastTurnCheck(
        "Turn 3 'and on weekends' after 'swimming' + 'in the east'. PASS if it returns swimming in the east on weekends — all three carried. FAIL if it dropped swimming, the east, or ignored weekends.",
      ),
    },
    {
      name: "correction: 'no, I meant just music'",
      mode: "discovery",
      include: "products",
      turns: ["show me art and music classes", "no, I meant just music"],
      check: lastTurnCheck(
        "Turn 2 'just music' narrows from 'art and music'. PASS if it now focuses on MUSIC. FAIL if it still includes art or asks from scratch.",
      ),
    },
    {
      name: "'start over' resets the search",
      mode: "discovery",
      include: "products",
      turns: [
        "swimming for my 5 year old in Jurong",
        "actually let's start over — coding for a 10 year old",
      ],
      check: lastTurnCheck(
        "Turn 2 restarts with coding for a 10yo. PASS if it now talks about coding for a 10yo and drops the old swimming/Jurong/5yo context. FAIL if it still references swimming or the old age/area.",
      ),
    },
    {
      // Regression: a bare-AREA refinement on the PROVIDERS tab must NOT drop the
      // established activity. If it does, the search becomes an unfiltered area
      // browse and the provider cards flood with off-activity venues (martial
      // arts, language, ballet, bowling…). The reply prose can still read fine, so
      // we assert on the CARD DATA, not the prose. Mirrors the real broken chat:
      // "drawing" established, then "near orchards" → provider list of MMA/etc.
      name: "providers: bare-area refine keeps the activity (no off-activity flood)",
      mode: "discovery",
      include: "merchants",
      turns: ["drawing classes for my 6 year old", "near orchards"],
      check: async ({ results, lastReply }) => {
        const issues = searched(results)
          ? []
          : ["no search ran on the follow-up turn"];
        // Off-activity provider names that only appear when "drawing" was dropped
        // and the search browsed every provider near the area.
        const OFF_ACTIVITY =
          /\b(mma|martial|taekwondo|jiu[- ]?jitsu|muay|boxing|ballet|bowling|laser\s?tag|gymnastic|language)\b/i;
        const bad = (results?.merchants?.data ?? [])
          .map((m) => m?.name)
          .filter((n) => n && OFF_ACTIVITY.test(n));
        if (bad.length)
          issues.push(
            `activity dropped — off-activity providers surfaced: ${[...new Set(bad)].slice(0, 5).join(", ")}`,
          );
        const v = await judge(
          lastReply,
          "Turn 2 'near orchards' after 'drawing classes for my 6 year old', on the PROVIDERS tab. PASS if the reply stays on ART/DRAWING providers near Orchard (activity carried). FAIL if it drifted off drawing.",
        );
        if (!v.pass) issues.push(`activity not carried: ${v.reason}`);
        return issues;
      },
    },
    // --- additional multi-turn cases ---
    {
      name: "refine by area — 'in the west please'",
      mode: "discovery",
      include: "products",
      turns: ["art classes", "in the west please"],
      check: lastTurnCheck("Turn 2 'in the west please' after 'art classes'. PASS if it returns ART in the west (activity carried). FAIL if it drops art or asks 'west what?'."),
    },
    {
      name: "add a day constraint — 'make it weekends only'",
      mode: "discovery",
      include: "products",
      turns: ["swimming for my 7 year old", "make it weekends only"],
      check: lastTurnCheck("Turn 2 'weekends only' after swimming for a 7yo. PASS if it keeps swimming for a 7yo on weekends. FAIL if it dropped swimming or the age."),
    },
    {
      name: "switch instrument — 'actually violin instead'",
      mode: "discovery",
      include: "products",
      turns: ["piano lessons", "actually violin instead"],
      check: lastTurnCheck("Turn 2 'violin instead' after piano. PASS if it now talks about violin. FAIL if it still pushes piano."),
    },
    {
      name: "correct the age down — 'he's 4'",
      mode: "discovery",
      include: "products",
      turns: ["football", "for a younger kid, he's 4"],
      check: lastTurnCheck("Turn 2 'he's 4' after football. PASS if it now offers football suitable for a 4yo (activity carried, age applied). FAIL if it ignores the age."),
    },
    {
      name: "budget refine — 'any cheaper?'",
      mode: "discovery",
      include: "products",
      turns: ["coding classes", "any cheaper?"],
      check: lastTurnCheck("Turn 2 'any cheaper?' after coding. PASS if it stays on coding and leans cheaper. FAIL if it asks 'cheaper what?' or switches activity."),
    },
    {
      name: "narrow proximity — 'closer to Bedok?'",
      mode: "discovery",
      include: "products",
      turns: ["ballet in the east", "closer to Bedok?"],
      check: lastTurnCheck("Turn 2 'closer to Bedok?' after 'ballet in the east'. PASS if it keeps ballet and narrows toward Bedok. FAIL if it drops ballet."),
    },
    {
      name: "narrow the month — 'just the June ones'",
      mode: "discovery",
      include: "products",
      turns: ["holiday camps", "just the June ones"],
      check: lastTurnCheck("Turn 2 'just the June ones' after holiday camps. PASS if it keeps holiday camps and focuses on June. FAIL if it drops camps."),
    },
    {
      name: "add area — 'and near Tampines'",
      mode: "discovery",
      include: "products",
      turns: ["drama classes", "and near Tampines"],
      check: lastTurnCheck("Turn 2 'and near Tampines' after drama. PASS if it keeps drama near Tampines. FAIL if it drops drama or the area."),
    },
    {
      name: "more of the same — 'show me more options'",
      mode: "discovery",
      include: "products",
      turns: ["gymnastics", "show me more options"],
      check: lastTurnCheck("Turn 2 'show me more options' after gymnastics. PASS if it offers more gymnastics options — same search continued. FAIL if it restarts or asks what activity."),
    },
    {
      name: "asks about a shown result — 'which has a free trial?'",
      mode: "discovery",
      include: "products",
      turns: ["swimming classes", "which of these has a free trial?"],
      check: async ({ lastReply, allReplies }) => {
        const issues = [];
        const leaks = replyLeaks(allReplies);
        if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
        const v = await judge(lastReply, "Turn 2 asks which of the shown swimming options has a free trial. PASS if it stays on swimming and helpfully addresses free trials (or honestly says it can't confirm per-class). FAIL if it switches activity or fabricates a trial as fact.");
        if (!v.pass) issues.push(`context: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "add a time — 'weekday evenings?'",
      mode: "discovery",
      include: "products",
      turns: ["tennis for my 9 year old", "what about weekday evenings?"],
      check: lastTurnCheck("Turn 2 'weekday evenings?' after tennis for a 9yo. PASS if it keeps tennis for a 9yo and addresses weekday evenings. FAIL if it dropped tennis or the age."),
    },
    {
      name: "narrow from two activities — 'just coding actually'",
      mode: "discovery",
      include: "products",
      turns: ["art and coding", "just coding actually"],
      check: lastTurnCheck("Turn 2 'just coding' after 'art and coding'. PASS if it now focuses on coding. FAIL if it still includes art."),
    },
    {
      name: "two children added — 'for two kids, 5 and 8'",
      mode: "discovery",
      include: "products",
      turns: ["music classes", "for two kids, 5 and 8"],
      check: lastTurnCheck("Turn 2 'two kids, 5 and 8' after music. PASS if it keeps music and respects both ages. FAIL if it drops music or ignores an age."),
    },
    {
      name: "swap area — 'any in the east instead?'",
      mode: "discovery",
      include: "products",
      turns: ["basketball near Jurong", "any in the east instead?"],
      check: lastTurnCheck("Turn 2 'east instead?' after 'basketball near Jurong'. PASS if it keeps basketball and moves to the east. FAIL if it drops basketball."),
    },
    {
      name: "restart with new intent — 'start over, camps for my 10yo'",
      mode: "discovery",
      include: "products",
      turns: ["classes for my 6 year old", "let's start over — camps for my 10 year old"],
      check: lastTurnCheck("Turn 2 restarts with camps for a 10yo. PASS if it now talks about camps for a 10yo and drops the old 6yo context. FAIL if it still references the old age."),
    },
    {
      name: "drill into a result — 'the first one, tell me more'",
      mode: "discovery",
      include: "products",
      turns: ["swimming lessons", "the first one — tell me more"],
      check: async ({ lastReply, allReplies }) => {
        const issues = [];
        const leaks = replyLeaks(allReplies);
        if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
        const v = await judge(lastReply, "Turn 2 'the first one — tell me more' after swimming lessons. PASS if it stays on swimming and elaborates on a shown option (or points to its page for details) without inventing specifics. FAIL if it switches activity or fabricates details.");
        if (!v.pass) issues.push(`context: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "soften the level — 'something less competitive'",
      mode: "discovery",
      include: "products",
      turns: ["dance for my 7 year old", "something less competitive"],
      check: lastTurnCheck("Turn 2 'less competitive' after dance for a 7yo. PASS if it keeps dance for a 7yo and leans casual/recreational. FAIL if it drops dance."),
    },
    {
      name: "add a day — 'and on Saturdays'",
      mode: "discovery",
      include: "products",
      turns: ["coding for my 9 year old", "and on Saturdays"],
      check: lastTurnCheck("Turn 2 'and on Saturdays' after coding for a 9yo. PASS if it keeps coding for a 9yo on Saturdays. FAIL if it dropped coding or the age."),
    },
    {
      name: "add a duration — 'half day only'",
      mode: "discovery",
      include: "products",
      turns: ["enrichment for my 4 year old", "half day only"],
      check: lastTurnCheck("Turn 2 'half day only' after enrichment for a 4yo. PASS if it keeps enrichment for a 4yo and respects half-day. FAIL if it drops the activity or age."),
    },
    {
      name: "full switch — 'actually let's do swimming'",
      mode: "discovery",
      include: "products",
      turns: ["football", "actually let's do swimming"],
      check: lastTurnCheck("Turn 2 'actually swimming' after football. PASS if it now talks about swimming. FAIL if it still pushes football."),
    },
  ],
};
