import { venueScopeIssues, judge } from "../../engine.mjs";

/**
 * GOLDEN · EXACT-FACT tier (concierge) — the true analogue of the WhatsApp
 * literal-price cases. Each entry PINS a flagship merchant's REAL
 * merchantId/locationId and asserts a REAL price/age via the judge.
 *
 * NON-CRITICAL — these never block the launch gate; they are the exact-fact
 * TARGET. They need the flagship merchants PUBLISHED + Typesense-indexed in the
 * environment the eval hits, so run them against the rich dev/prod catalogue
 * (BOOKING_API_BASE + the server's Typesense). On the sparse local seed they
 * honestly MISS (the rubric passes on the real fact OR an honest "not listed"),
 * never a false fail and never a false pass on a wrong number.
 *
 * How it can't rot: the rubric bakes in the real fact and FAILS ONLY on a specific
 * CONTRADICTING value. Fill the table from the catalogue extract
 * (product_extraction_template.xlsx); entries missing a numeric id are skipped.
 *
 * See docs/concierge/golden-launch-readiness-gate.md.
 */
const FLAGSHIP_FACTS = [
  // --- Impressions Kids Club (merchant 574) — the richest fixture, two clubs.
  {
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "how much is the Just Play membership?",
    fact: "$200 per month",
    contradicts: "any monthly Just Play price other than $200 (e.g. $180)",
  },
  {
    merchant: "Impressions Kids Club — Cluny Court",
    merchantId: 574,
    locationId: 1620,
    ask: "how much is the Just Play membership?",
    fact: "$180 per month (Cluny Court is cheaper than Tanglin's $200)",
    contradicts: "any monthly Just Play price other than $180 (e.g. $200)",
  },
  {
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "what's the entry fee for the playzone?",
    fact: "$35 playzone entry",
    contradicts: "a playzone entry price other than $35",
  },
  {
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "how much is the one-week trial?",
    fact: "$90 for the 1-week trial",
    contradicts: "a trial price other than $90",
  },
  {
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "what ages is the Kids Camp for?",
    fact: "ages 4 to 8",
    contradicts: "an age range other than 4–8 for the Kids Camp",
  },
  {
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "what ages is the Montessori Camp for?",
    fact: "18 months to 6 years",
    contradicts: "an age range other than 18mo–6yr for the Montessori Camp",
  },
  {
    // Birthday: Impressions publishes no fixed party price — this FAILS only if the
    // guide fabricates a number instead of inviting an enquiry.
    merchant: "Impressions Kids Club — Tanglin Mall",
    merchantId: 574,
    locationId: 1619,
    ask: "how much is a birthday party here?",
    fact: "no fixed party price is published — it should invite an enquiry, not quote a number",
    contradicts: "a specific made-up birthday-party price",
  },

  // --- Other flagship merchants from the extract sheet. Facts are transcribed;
  // fill in the real merchantId/locationId from the sheet to activate each (entries
  // without numeric ids are skipped so this file always stays runnable).
  // { merchant: "Kumon Maths", merchantId: null, locationId: null,
  //   ask: "how much per month?", fact: "$170 per month",
  //   contradicts: "a monthly fee other than $170" },
  // { merchant: "aquaDucks", merchantId: null, locationId: null,
  //   ask: "how much is a swimming lesson?", fact: "about $40 weekday / $51.50 weekend",
  //   contradicts: "a lesson price far from ~$40 wkday / $51.50 wkend" },
  // { merchant: "My Gym", merchantId: null, locationId: null,
  //   ask: "how much is a trial class?", fact: "$65 trial",
  //   contradicts: "a trial price other than $65" },
  // { merchant: "Drum Tutor", merchantId: null, locationId: null,
  //   ask: "how much is the Ankle-Biter drum class?", fact: "$170 per month",
  //   contradicts: "a monthly fee other than $170" },
  // { merchant: "Global Art", merchantId: null, locationId: null,
  //   ask: "what ages do you take?", fact: "ages 3 to 16",
  //   contradicts: "an age range other than 3–16" },
  // { merchant: "Yamaha", merchantId: null, locationId: null,
  //   ask: "what ages is the piano course for?", fact: "ages 6 to 8",
  //   contradicts: "an age range other than 6–8" },
];

const scenarios = FLAGSHIP_FACTS.filter(
  (f) => Number.isInteger(f.merchantId) && Number.isInteger(f.locationId),
).map((f) => ({
  name: `${f.merchant} — ${f.ask}`,
  mode: "venue",
  merchantId: f.merchantId,
  locationId: f.locationId,
  check: async ({ results, allReplies }) => {
    const issues = venueScopeIssues(results, allReplies);
    const v = await judge(
      allReplies,
      `The venue is ${f.merchant}. Parent asked: "${f.ask}". The REAL answer is: ${f.fact}. ` +
        `PASS if the reply states that real fact OR honestly says it isn't listed / to check with the venue. ` +
        `FAIL ONLY if it states ${f.contradicts}.`,
    );
    if (!v.pass) issues.push(`wrong fact: ${v.reason}`);
    return issues;
  },
}));

export default {
  category: "golden-exact-facts",
  critical: false, // exact-fact tier is the TARGET; it never blocks the gate
  scenarios,
};
