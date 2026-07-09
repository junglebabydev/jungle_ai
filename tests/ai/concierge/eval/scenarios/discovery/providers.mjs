import { discoveryRan, judge } from "../../engine.mjs";

/**
 * DISCOVERY · PROVIDERS (Activities tab) — with `include: "merchants"` the section
 * is server-pinned to PROVIDERS (centres, schools, studios), not individual
 * classes. The model must talk about providers and NOT try to list bookable
 * classes (it points to the CAMPS tab for that). Google rating / review count are
 * projected to the model, so a "best-rated" ask should lean on reputation.
 * Deterministic floor: a search ran + no leak; provider behaviour is judged.
 */
const providerCase = (name, turn, rubric) => ({
  name,
  mode: "discovery",
  include: "merchants",
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    const v = await judge(
      allReplies,
      `The ACTIVITIES tab shows PROVIDERS (centres/schools), not individual classes. PASS if the reply talks about providers and helps the parent pick one. ${rubric} FAIL if it dumps data, refuses, or fabricates a provider.`,
    );
    if (!v.pass) issues.push(`reply: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-providers",
  scenarios: [
    providerCase("find providers for an activity", "swimming schools for kids", "Intent: swim providers/schools."),
    providerCase("providers in an area", "art studios in the east", "Intent: art providers in the east."),
    providerCase("best-rated providers (reputation-aware)", "best rated music schools for children", "It should lean on reputation (rating/reviews) when highlighting providers; it must not invent a rating."),
    providerCase("providers near a place", "good enrichment centres near Jurong", "Intent: enrichment providers around Jurong."),
    {
      name: "asks to book a specific class on the providers tab → points to CAMPS tab",
      mode: "discovery",
      include: "merchants",
      turns: ["book me the Tuesday 4pm swim class at one of these"],
      check: async ({ allReplies }) => {
        const v = await judge(
          allReplies,
          "On the PROVIDERS (Activities) tab the parent asked to book a SPECIFIC class. PASS if the reply warmly explains this tab is for finding providers and points them to the CAMPS tab (or the provider) to see/book specific classes — while still helping. FAIL if it pretends to book it, invents a class, or claims a booking was made.",
        );
        return v.pass ? [] : [`tab guidance/booking: ${v.reason}`];
      },
    },
    {
      name: "provider vs class — switches intent across turns",
      mode: "discovery",
      include: "merchants",
      turns: ["which swim schools are good?", "ok show me their actual classes"],
      check: async ({ allReplies }) => {
        const v = await judge(
          allReplies,
          "Turn 1 asked for swim SCHOOLS (providers); turn 2 wants the actual CLASSES. PASS if turn 2 helpfully directs them to the CAMPS tab / a provider to see bookable classes (this tab is providers-only). FAIL if it claims to list bookable classes here as if the tab changed, or refuses.",
        );
        return v.pass ? [] : [`intent switch: ${v.reason}`];
      },
    },
    providerCase("provider with a specialty", "centres that specialise in early childhood music", "Intent: providers specialising in early-childhood music."),
    providerCase("established / reputable (no fabricated awards)", "any award-winning or well-established art studios?", "It may highlight established/reputable providers using rating, but must NOT invent awards or accolades."),
    // --- additional provider cases ---
    providerCase("well-known swim schools", "well-known swim schools for young kids", "Intent: reputable swim providers for young kids."),
    providerCase("violin schools", "music schools that teach violin", "Intent: music providers offering violin."),
    providerCase("term-class art studios", "art studios that do term classes", "Intent: art providers running term programmes."),
    providerCase("dance schools east", "dance schools in the east", "Intent: dance providers in the east."),
    providerCase("coding academies", "coding academies for primary school kids", "Intent: coding providers for primary-age kids."),
    providerCase("gymnastics centres near Bishan", "gymnastics centres near Bishan", "Intent: gymnastics providers around Bishan."),
    providerCase("beginner martial arts schools", "martial arts schools for beginners", "Intent: beginner-friendly martial-arts providers."),
    providerCase("preschool enrichment centres", "enrichment centres for preschoolers", "Intent: enrichment providers for preschoolers."),
    providerCase("football academies", "sports academies for football", "Intent: football provider academies."),
    providerCase("reputable ballet schools", "reputable ballet schools for my 5 year old", "Intent: well-regarded ballet providers for a 5yo; lean on reputation, no invented ratings."),
    providerCase("providers with trials", "schools that offer trial lessons", "Intent: providers offering trials; honest it can't confirm every provider's trial policy."),
    providerCase("experienced instructors", "centres with experienced instructors", "Intent: providers known for experienced staff; no fabricated credentials."),
    providerCase("speech & drama for shy kids", "speech and drama providers for shy kids", "Intent: speech/drama providers; takes the shyness seriously."),
    providerCase("small class sizes", "swimming schools with small class sizes", "Intent: swim providers with small classes; honest if it can't confirm class size."),
    providerCase("providers running camps", "which providers run holiday camps?", "Intent: providers that offer holiday camps."),
    providerCase("piano near Tampines", "schools near Tampines that teach piano", "Intent: piano providers around Tampines."),
    providerCase("parent-and-child providers", "providers that do parent-and-child classes", "Intent: providers offering parent-accompanied classes."),
    providerCase("long-established studios", "long-established art studios for kids", "Intent: established art providers; no invented history/awards."),
    providerCase("classes and camps both", "centres that offer both classes and camps", "Intent: providers offering both term classes and camps."),
    providerCase("well-reviewed near Jurong", "providers with good reviews near Jurong", "Intent: well-rated providers around Jurong; lean on real reviews, no invented ones."),
  ],
};
