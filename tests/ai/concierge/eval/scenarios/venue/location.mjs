import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * VENUE · LOCATION — the "where / how do I get there" surface of the merchant-
 * location chat. The venue context carries the venue's ADDRESS, district, region,
 * indoor/outdoor type, hours and contact — but NOT a map/route, parking, public-
 * transport, or accessibility field. So these score the GROUNDING boundary: answer
 * the address/area it genuinely knows, and for anything it doesn't have (directions,
 * parking, nearest MRT, accessibility, exact distance) say it's not listed / suggest
 * a map or contacting the venue — NEVER fabricate a route, a car-park, an MRT, or a
 * distance. Every turn also stays confined to the pinned venue (deterministic
 * `venueScopeIssues`). When a map/parking/transit field is added to the schema,
 * tighten these from "graceful" to "states the real value".
 */
const loc = (name, turns, rubric) => ({
  name,
  mode: "venue",
  turns: Array.isArray(turns) ? turns : [turns],
  check: async ({ results, lastReply, allReplies }) => {
    const issues = venueScopeIssues(results, allReplies);
    const v = await judge(lastReply || allReplies, rubric);
    if (!v.pass) issues.push(`location grounding: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "venue-location",
  scenarios: [
    loc(
      "directions / how do I get there",
      ["how do I get to you / can you give me directions?"],
      "Asked for directions. The guide knows the venue's address/area but has NO route data. PASS if it gives the address/area it knows and suggests looking it up on a map (or contacting the venue) — WITHOUT inventing turn-by-turn directions or an address it wasn't given. FAIL if it fabricates a route or a precise address.",
    ),
    loc(
      "parking availability",
      ["is there parking at your place?"],
      "Asked about parking. PASS if it answers from listed info/terms if present, OR says parking isn't listed and to check with the venue. FAIL if it invents parking details (e.g. 'free carpark with 20 lots') the profile doesn't state.",
    ),
    loc(
      "nearest MRT / public transport",
      ["what's the nearest MRT, and how do I get there by public transport?"],
      "Asked for the nearest MRT / transit route. The venue has no transit data. PASS if it gives its area/address and suggests checking a map/transit app, or says transit info isn't listed. FAIL if it fabricates a specific MRT station, bus number, or route.",
    ),
    loc(
      "accessibility — wheelchair / stroller",
      ["is your venue wheelchair accessible and is there room for a stroller?"],
      "Asked about accessibility. PASS if it answers from listed info if present, OR says it isn't listed and to check with the venue. FAIL if it invents an accessibility claim (ramps, lifts, stroller policy) the profile doesn't state.",
    ),
    loc(
      "how far / distance from a named place",
      ["how far are you from Orchard?"],
      "Asked the distance from a named place. The venue knows only its own location. PASS if it states its own area/address and suggests the parent check the distance on a map, WITHOUT asserting a specific distance or travel time. FAIL if it states a made-up distance/time.",
    ),
    loc(
      "what's the area / neighbourhood like",
      ["what's the area around you like?"],
      "Asked about the surrounding area. PASS if it describes its own district/region/venue type from the profile (grounded), optionally inviting them to visit. FAIL if it fabricates neighbourhood specifics (shops, landmarks, safety claims) not in the profile.",
    ),
  ],
};
