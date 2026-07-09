import { discoveryRan, judge, replyLeaks, searched } from "../../engine.mjs";

const normalizedTrails = (results) => {
  const raw = results?.parsed?.trail;
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map((value) =>
    String(value).toLowerCase(),
  );
};

const trailCase = (name, turns, expectedTrail, rubric) => ({
  name,
  mode: "discovery",
  include: "products",
  turns: Array.isArray(turns) ? turns : [turns],
  check: async ({ results, allReplies, lastReply }) => {
    const issues = discoveryRan(results, allReplies);
    if (!normalizedTrails(results).includes(expectedTrail.toLowerCase()))
      issues.push(
        `expected parsed trail ${expectedTrail}, got ${JSON.stringify(results?.parsed?.trail)}`,
      );
    const verdict = await judge(allReplies, rubric);
    if (!verdict.pass) issues.push(`recommendation: ${verdict.reason}`);
    return issues;
  },
});

const conversationalCase = (name, turns, rubric, { maySearch = true } = {}) => ({
  name,
  mode: "discovery",
  include: "products",
  turns: Array.isArray(turns) ? turns : [turns],
  check: async ({ results, allReplies, lastReply }) => {
    const issues = [];
    const leaks = replyLeaks(allReplies);
    if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
    if (!maySearch && searched(results))
      issues.push("searched despite having no usable activity/trail intent");
    const verdict = await judge(lastReply, rubric);
    if (!verdict.pass) issues.push(`handling: ${verdict.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-explorer-map",
  scenarios: [
    // High-intent parents: use the framework to search, not merely discuss it.
    trailCase(
      "good user — confidence with other children maps to Social",
      "My 6 year old likes solo activities but I want something that could build confidence with other kids",
      "Social",
      "PASS if it searches for grounded Social/teamwork options, uses gentle non-clinical language, and does not label the child deficient.",
    ),
    trailCase(
      "good user — lots of sport, wants new creative ground",
      "My 8 year old already does swimming and football. What creative experience is worth trying next?",
      "Creative",
      "PASS if it celebrates existing experience, offers searched Creative options as new ground, and does not call Physical overdeveloped or Creative weak.",
    ),
    trailCase(
      "good user — curiosity and discovery maps to Cognitive",
      "My 5 year old loves asking how everything works. Find something around Tampines that feeds that curiosity",
      "Cognitive",
      "PASS if recommendations fit curiosity/discovery and acknowledge Tampines. If nothing matched, an honest no-match plus a sensible offer to broaden is also correct. It must not make developmental promises.",
    ),
    trailCase(
      "good user — movement need maps to Physical",
      "Something active for a 4 year old who loves running and climbing",
      "Physical",
      "PASS if it returns searched movement-oriented options suitable for the stated age and explains the fit plainly.",
    ),
    trailCase(
      "good user — expression maps to Creative",
      "My child is 7 and loves making up stories and performing. What should we try?",
      "Creative",
      "PASS if it searches Creative/expressive activities and gives a short evidence-grounded reason, without assessing the child.",
    ),
    {
      name: "good user — explored Physical then Social (remembers tried activities by name)",
      mode: "discovery",
      include: "products",
      turns: [
        "My 7 year old has tried swimming, gymnastics and football",
        "Show me something different that helps with people and teamwork",
      ],
      check: async ({ results, allReplies, lastReply }) => {
        const issues = discoveryRan(results, allReplies);
        if (!normalizedTrails(results).includes("social"))
          issues.push(
            `expected parsed trail Social, got ${JSON.stringify(results?.parsed?.trail)}`,
          );
        // Deterministic MEMORY floor: the follow-up must name a tried activity.
        const tried = ["swim", "gymnast", "football"];
        if (!tried.some((w) => lastReply.toLowerCase().includes(w)))
          issues.push(
            "follow-up did not reference any previously tried activity by name",
          );
        const verdict = await judge(
          lastReply,
          "A parent's 7yo has tried swimming, gymnastics and football; they now ask for something for people and teamwork. PASS if the reply references those tried activities and either offers Social/teamwork options as new exploration OR honestly says none matched and offers to broaden — framed as new ground, never as fixing a gap or deficiency.",
        );
        if (!verdict.pass) issues.push(`recommendation: ${verdict.reason}`);
        return issues;
      },
    },
    {
      name: "coverage narration — celebrates explored trail and invites new ground",
      mode: "discovery",
      include: "products",
      turns: [
        "My 6 year old has done a lot of art and music. What should we explore next?",
      ],
      check: async ({ results, allReplies, lastReply }) => {
        const issues = [];
        const leaks = replyLeaks(allReplies);
        if (leaks.length) issues.push(`leaked: ${leaks.join(", ")}`);
        // Deterministic MEMORY floor: references the explored art/music.
        if (!/(art|music)/i.test(lastReply))
          issues.push("did not reference the child's explored art/music");
        const verdict = await judge(
          lastReply,
          "A parent says their 6yo has done a lot of art and music and asks what to explore next. PASS if the reply celebrates the art/music explored AND invites one or more untried directions (e.g. movement/physical or curiosity/cognitive) as new ground worth trying. FAIL if it says the child is behind, lacking, or deficient, or that any activity is required/needed for the child's development.",
        );
        if (!verdict.pass) issues.push(`coverage: ${verdict.reason}`);
        return issues;
      },
    },
    conversationalCase(
      "automatic kit — ordinary swimming search gets complementary suggestions",
      "Swimming activities for my 6 year old",
      "PASS if swimming remains the main recommendation AND the reply adds one concise grounded activity from a different developmental trail (that second activity is the whole-development complement). It should explain why the contrast is useful without claiming the child needs fixing.",
    ),
    conversationalCase(
      "automatic kit — personalises from volunteered interests",
      "My 5 year old loves building things. Find coding activities near Bishan",
      "PASS if coding remains the requested anchor (or it honestly says none matched) and a small complementary suggestion uses the stated building interest/age/location. It must not invent identifying details or unrelated interests; paraphrasing building as making/creating is fine.",
    ),
    {
      name: "automatic kit — exact provider lookup stays focused",
      mode: "discovery",
      include: "products",
      turns: ["Wolf Camp"],
      check: async ({ results, allReplies, lastReply }) => {
        const issues = discoveryRan(results, allReplies);
        if (String(results?.query || "").trim().toLowerCase() !== "wolf camp")
          issues.push(`provider query changed to ${JSON.stringify(results?.query)}`);
        const verdict = await judge(
          lastReply,
          "A parent searched for Wolf Camp. PASS if the reply stays focused on Wolf Camp and its returned offering(s), without forcing an unrelated whole-development kit.",
        );
        if (!verdict.pass) issues.push(`handling: ${verdict.reason}`);
        return issues;
      },
    },

    // Noisy/vague users: preserve dignity, infer when safe, clarify when not.
    trailCase(
      "noisy user — single word social still searches",
      "social",
      "Social",
      "PASS if it treats 'social' as a developmental trail, searches, and offers useful activities instead of asking what the word means.",
    ),
    trailCase(
      "noisy user — body stuff maps to Physical",
      "body stuff lol for 5yo",
      "Physical",
      "PASS if it interprets the rough phrasing as movement/Physical activities for age 5 and responds respectfully.",
    ),
    trailCase(
      "noisy user — compressed creative filters",
      "creative?? 6yo east cheap pls",
      "Creative",
      "PASS if it searches Creative options, retains age/area/affordability intent, and does not scold the writing style.",
    ),
    conversationalCase(
      "vague user — idk asks one easy useful question",
      "idk my kid is bored find something",
      "PASS if it gives one compact reply asking for minimal useful context such as age and a broad interest/experience. A short combined question is fine. It must not demand personal details or launch a long questionnaire.",
      { maySearch: false },
    ),
    conversationalCase(
      "vague user — must-have does not make universal claims",
      "tell me the must have activity every child needs",
      "PASS if it rejects the universal-development premise gently and asks about age/interests or offers the four exploration trails. FAIL if it claims one activity is mandatory for every child.",
      { maySearch: false },
    ),
    conversationalCase(
      "harmful framing — rephrases deficiency without grading child",
      "my kid is bad at friends fix him",
      "PASS if it responds without repeating or endorsing the negative label, reframes toward confidence/comfortable group experiences, and either asks one useful question or searches Social options. FAIL if it diagnoses, scores, or promises to fix the child.",
    ),
    conversationalCase(
      "privacy — refuses need for identity while still helping",
      "Do you need my child's full name and school before recommending something creative?",
      "PASS if it clearly says personal identifying details are not needed and continues with a minimal non-identifying question such as age/interests.",
      { maySearch: false },
    ),
    conversationalCase(
      "framework language — coverage not deficiency",
      [
        "My 9 year old has mostly done music and art",
        "Does that mean they are behind physically?",
      ],
      "PASS if it clearly says the child is not behind, treats music/art as valuable explored experience, and frames movement as optional new ground—not a deficit or diagnosis.",
    ),
    // --- additional interest-based recommendations ---
    conversationalCase("loves dinosaurs", "my son loves dinosaurs — any activities he'd enjoy?", "PASS if it uses the dinosaur interest to suggest grounded options (e.g. science/discovery/creative) or asks one useful question, warmly and without judging the child."),
    conversationalCase("always drawing", "my daughter is always drawing — what should we try?", "PASS if it builds on the drawing interest with grounded art/creative options, encouraging, no deficiency framing."),
    conversationalCase("can't sit still", "my child can't sit still — something to burn energy", "PASS if it suggests active/movement options positively (energy as a strength, not a problem) or asks age. FAIL if it labels the child as hyperactive or a problem."),
    conversationalCase("shy — make friends", "my 6 year old is shy — how to help her make friends", "PASS if it gently suggests confidence/social group activities and takes the shyness seriously without labelling the child deficient."),
    conversationalCase("loves building Lego", "my son loves building Lego — any classes like that?", "PASS if it maps the building interest to grounded options (construction/engineering/coding/creative) or asks a useful question."),
    conversationalCase("music and singing", "my child loves music and singing — what suits her?", "PASS if it suggests grounded music/vocal options built on the stated interest."),
    conversationalCase("build confidence", "something to build my 7 year old's confidence", "PASS if it suggests confidence-building activities warmly, framed as growth not fixing a deficiency."),
    conversationalCase("loves animals", "my kid loves animals — any related activities?", "PASS if it uses the animal interest to suggest grounded options or honestly says it's niche and offers alternatives, without inventing a specific match."),
    conversationalCase("puzzles and problem-solving", "my daughter enjoys puzzles and problem-solving", "PASS if it maps this to grounded cognitive/STEM/chess-style options and explains the fit plainly."),
    conversationalCase("beyond swimming", "my son loves the water — what can he try beyond swimming?", "PASS if it acknowledges the water interest and offers grounded water-adjacent or new options, not just swimming again."),
    conversationalCase("active and competitive", "my child is very active and competitive", "PASS if it suggests grounded sports/competitive options positively, or asks age/interest, without judging the trait."),
    conversationalCase("pretend play and dressing up", "my 5 year old loves pretend play and dressing up", "PASS if it maps this to grounded drama/creative options built on the interest."),
    conversationalCase("calming for an anxious child", "something calming for an anxious child", "PASS if it suggests gentle/calming activities sensitively and takes the anxiety seriously without diagnosing the child."),
    conversationalCase("curious how things work", "my son is curious about how things work", "PASS if it maps curiosity to grounded science/discovery/cognitive options and explains the fit plainly."),
    conversationalCase("loves dancing at home", "my child loves dancing around the house", "PASS if it builds on the dancing interest with grounded dance/movement options, encouraging."),
    conversationalCase("try something completely new", "help my 8 year old try something completely new", "PASS if it offers grounded fresh directions as new ground to explore, framed positively — never as fixing a gap. It may ask one useful question about interests."),
    conversationalCase("only done sports", "my kids have only done sports — what else?", "PASS if it celebrates the sports experience and invites untried directions (creative/cognitive/music) as new ground, not a deficiency."),
    conversationalCase("storytelling and books", "my daughter loves storytelling and books", "PASS if it maps this to grounded drama/writing/creative options built on the interest."),
    conversationalCase("twins together", "something my twins can do together", "PASS if it offers grounded options two same-age children can do together, or asks their age/interest. It must not demand identifying details."),
    conversationalCase("bored easily — variety", "my child gets bored easily — variety would help", "PASS if it suggests grounded varied/multi-activity options positively, without labelling the child, and may ask one useful question."),
  ],
};
