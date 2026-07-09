import {
  discoveryRan,
  productsOutOfRegions,
  productsOutOfDistricts,
  judge,
} from "../../engine.mjs";

/**
 * DISCOVERY · REGIONS & AREAS — "where" comes in two shapes: the broad REGION chip
 * (Central/East/West/North/North-East/South — server-PINNED → deterministic via
 * `productsOutOfRegions`) and a free-text DISTRICT in the message. `district`
 * ("in/at X") is a hard filter checked deterministically (`productsOutOfDistricts`);
 * `nearDistrict` ("near/around X") is a proximity RANKING, so it's judged, not
 * asserted. Full per-region coverage + the in/near distinction.
 */

// One scenario per region chip — each result must sit in that region.
const regionChip = (chip) => ({
  name: `region chip '${chip}' constrains every result (deterministic)`,
  mode: "discovery",
  include: "products",
  region: [chip],
  turns: ["activities for my 7 year old"],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    issues.push(...productsOutOfRegions(results, [chip]));
    return issues;
  },
});

// Judged free-text area probe: a search ran + no leak, and the reply keeps the
// requested area (exact or proximity) without fabricating routes/distances.
const areaCase = (name, turn, rubric) => ({
  name,
  mode: "discovery",
  include: "products",
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    const v = await judge(
      allReplies,
      `A parent searching for kids' activities in/around a specific area. PASS if the reply keeps that area (or honestly says nothing's listed there) and stays grounded. ${rubric} FAIL if it silently drops the area or fabricates a specific distance/route.`,
    );
    if (!v.pass) issues.push(`area: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-regions",
  scenarios: [
    regionChip("Central"),
    regionChip("East"),
    regionChip("West"),
    regionChip("North"),
    regionChip("North-East"),
    regionChip("South"),
    {
      name: "three regions OR-ed: every result is in one of them (deterministic)",
      mode: "discovery",
      include: "products",
      region: ["East", "West", "North"],
      turns: ["swimming for my 6 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["East", "West", "North"]));
        return issues;
      },
    },
    {
      name: "free-text 'in <district>' is honored (deterministic district)",
      mode: "discovery",
      include: "products",
      turns: ["drawing classes in Tampines for my 8 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        // Assert the HARD-district invariant ONLY when the server actually applied an
        // exact Tampines filter — i.e. the model set `district` (not `nearDistrict`)
        // AND it wasn't broadened to proximity (the empty→geo fallback rewrites
        // parsed.district→undefined). Otherwise this is a model-field / seed-coverage
        // concern the judge below covers, not a filter bug. (parsed echoes what ran.)
        if (results?.parsed?.district?.toLowerCase() === "tampines")
          issues.push(...productsOutOfDistricts(results, ["Tampines"]));
        const v = await judge(
          allReplies,
          "Parent wants drawing IN Tampines for an 8yo. PASS if the reply keeps the Tampines location (or says nothing's listed there). FAIL if it silently drops the area.",
        );
        if (!v.pass) issues.push(`area dropped: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "'near <district>' is proximity, not a hard filter (judged)",
      mode: "discovery",
      include: "products",
      turns: ["robotics classes near Bishan for my 9 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Parent wants robotics NEAR Bishan (proximity). PASS if the reply offers robotics options around/near Bishan (closest-first is fine; it need not be only Bishan). FAIL if it ignores Bishan entirely or refuses.",
        );
        if (!v.pass) issues.push(`proximity ignored: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "region chip wins over a different area typed in the message",
      mode: "discovery",
      include: "products",
      region: ["West"],
      turns: ["swimming in the east"],
      check: async ({ results, allReplies }) => {
        // The pinned chip (West) is authoritative; results must be West despite
        // the message saying "east".
        const issues = discoveryRan(results, allReplies);
        issues.push(...productsOutOfRegions(results, ["West"]));
        return issues;
      },
    },
    {
      name: "two districts named (judged — district is single-select)",
      mode: "discovery",
      include: "products",
      turns: ["art classes in Tampines or Bedok for my 7 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Parent named two areas (Tampines or Bedok). PASS if it helps with art in the east / either area (or says none). FAIL if it drops the area entirely.",
        );
        if (!v.pass) issues.push(`area: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "near an MRT / landmark (proximity, judged)",
      mode: "discovery",
      include: "products",
      turns: ["swimming near Orchard MRT for my 6 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Parent wants swimming near Orchard MRT (proximity). PASS if it offers options around Orchard. FAIL if it ignores the location or refuses.",
        );
        if (!v.pass) issues.push(`proximity: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "region named in words (not a chip) is respected (judged)",
      mode: "discovery",
      include: "products",
      turns: ["coding classes somewhere in the north for my 9 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Parent said 'in the north' (a region, in words not a chip). PASS if it keeps the north (or says none there). FAIL if it drops the area.",
        );
        if (!v.pass) issues.push(`region: ${v.reason}`);
        return issues;
      },
    },
    {
      // Discovery is SEARCH, not a maps/route service. A "how do I get there"
      // framing should turn into an area search (or a where-are-you question),
      // never fabricated directions.
      name: "'how do I get to a class near me' → searches by area, no fabricated directions",
      mode: "discovery",
      include: "products",
      turns: ["how do I get to a good swimming class near me?"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "A SEARCH concierge (no maps/routing) asked 'how do I get to a class near me'. PASS if it helps FIND swimming by area — asks where they are or offers options — and points to a provider/page for directions. FAIL if it invents turn-by-turn directions or a specific route.",
        );
        if (!v.pass) issues.push(`directions: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "'closest to <area>' is handled as proximity search (judged)",
      mode: "discovery",
      include: "products",
      turns: ["what's the closest art class to Bishan for my 7 year old?"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Asked for the CLOSEST art class to Bishan. PASS if it offers art near Bishan (proximity), or says none nearby. FAIL if it ignores Bishan or fabricates a specific distance.",
        );
        if (!v.pass) issues.push(`proximity: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "'within walking distance of <MRT>' → proximity, no fabricated walk times",
      mode: "discovery",
      include: "products",
      turns: ["activities within walking distance of Orchard MRT for my 8 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "Asked for activities within walking distance of Orchard MRT. PASS if it offers options around Orchard (proximity). FAIL if it asserts a specific walking time/distance it cannot know, or ignores the location.",
        );
        if (!v.pass) issues.push(`walking distance: ${v.reason}`);
        return issues;
      },
    },
    // --- additional area cases ---
    areaCase("Pasir Ris", "swimming in Pasir Ris for my 6 year old", "Area: Pasir Ris."),
    areaCase("Bedok", "art classes in Bedok", "Area: Bedok."),
    areaCase("near Clementi", "coding near Clementi for my 9 year old", "Area: near Clementi (proximity)."),
    areaCase("Ang Mo Kio", "football in Ang Mo Kio for my 8 year old", "Area: Ang Mo Kio."),
    areaCase("Serangoon", "ballet in Serangoon for my 5 year old", "Area: Serangoon."),
    areaCase("Punggol", "piano lessons in Punggol", "Area: Punggol."),
    areaCase("Sengkang", "gymnastics in Sengkang for my 7 year old", "Area: Sengkang."),
    areaCase("near Woodlands", "classes near Woodlands for my 10 year old", "Area: near Woodlands."),
    areaCase("Yishun", "taekwondo in Yishun", "Area: Yishun."),
    areaCase("Bukit Timah", "enrichment in Bukit Timah for my 4 year old", "Area: Bukit Timah."),
    areaCase("Holland Village", "anything near Holland Village for my 6 year old", "Area: near Holland Village."),
    areaCase("Novena", "drama classes in Novena", "Area: Novena."),
    areaCase("near Toa Payoh MRT", "swimming near Toa Payoh MRT", "Area: near Toa Payoh MRT (proximity)."),
    areaCase("Katong", "tennis in Katong for my 9 year old", "Area: Katong."),
    areaCase("Marine Parade", "activities around Marine Parade", "Area: around Marine Parade."),
    areaCase("the west", "classes in the west for my 8 year old", "Area: the west region."),
    areaCase("Bukit Panjang", "what's near Bukit Panjang for my 7 year old", "Area: near Bukit Panjang."),
    areaCase("Choa Chu Kang", "coding in Choa Chu Kang", "Area: Choa Chu Kang."),
    areaCase("Hougang", "basketball in Hougang for my 11 year old", "Area: Hougang."),
    areaCase("near Queenstown MRT", "art near Queenstown MRT for my 6 year old", "Area: near Queenstown MRT (proximity)."),
  ],
};
