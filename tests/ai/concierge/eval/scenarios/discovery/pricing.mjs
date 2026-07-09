import { discoveryRan, judge } from "../../engine.mjs";

/**
 * DISCOVERY · PRICING / BUDGET — parents shop by money: "cheap", "under $200",
 * "best value", "free trial first". The discovery PRODUCT card does NOT carry price
 * (pricing lives behind the per-venue get_activity_details), so we CANNOT
 * deterministically assert a price ceiling here — we assert the CONTRACT: a search
 * ran honoring the budget angle, the reply respects it, and it never INVENTS a
 * specific dollar figure it couldn't have (discovery has no price lookup).
 * Exact-price answering is tested venue-side in venue/pricing.mjs.
 */
const budgetCase = (name, turn, rubric) => ({
  name,
  mode: "discovery",
  include: "products",
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    const v = await judge(
      allReplies,
      `A discovery concierge (it can rank by affordability but has NO exact price lookup). PASS if the reply respects the budget intent and stays grounded. ${rubric} FAIL if it INVENTS a specific price/fee for a class as fact.`,
    );
    if (!v.pass) issues.push(`reply: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-pricing",
  scenarios: [
    budgetCase("cheapest / most affordable", "cheapest swimming classes for my 6 year old", "Intent: most affordable swimming — it should lean into affordable options."),
    budgetCase("hard ceiling — under a number", "art classes under $150 for my 5 year old", "Intent: art under $150 — it should respect the ceiling."),
    budgetCase("free trial first", "swimming with a free trial so we can try before paying", "Intent: a free trial / try-before-you-pay."),
    budgetCase("value comparison", "what's the best value coding class for my 9 year old?", "Intent: best value — a reasoned suggestion is fine; it must not fabricate exact fees."),
    {
      name: "asks the exact price → honest about needing the activity page (no invention)",
      critical: true, // must-pass: never invents a price
      mode: "discovery",
      include: "products",
      turns: ["exactly how much is the swimming class you'd recommend?"],
      check: async ({ allReplies }) => {
        const v = await judge(
          allReplies,
          "On DISCOVERY (no exact-price tool) the parent demanded the precise price of a class. PASS if it names/recommends an option and points them to its page/provider for exact pricing, OR gives only a general affordability steer — WITHOUT stating a specific made-up dollar amount as fact. FAIL if it asserts an invented exact price.",
        );
        return v.pass ? [] : [`fabricated price: ${v.reason}`];
      },
    },
    {
      name: "budget refine carries the activity (multi-turn)",
      mode: "discovery",
      include: "products",
      turns: ["piano lessons for my 7 year old", "anything more affordable?"],
      check: async ({ results, lastReply }) => {
        const issues = discoveryRan(results, lastReply);
        const v = await judge(
          lastReply,
          "Turn 2 'anything more affordable?' after piano for a 7yo. PASS if it stays on piano and leans cheaper (activity + age carried). FAIL if it asks 'cheaper what?' or switches activity.",
        );
        if (!v.pass) issues.push(`context: ${v.reason}`);
        return issues;
      },
    },
    budgetCase("price range between two numbers", "swimming classes between $100 and $300 for my 6 year old", "Intent: swimming priced roughly $100-300."),
    budgetCase("free activities / open days", "any free activities or open days for kids?", "Intent: free / no-cost options; it should engage with 'free', not push paid classes only, and not invent a price."),
    budgetCase("sibling discount intent (honest, no fabrication)", "anywhere that gives a sibling discount for two kids?", "Intent: sibling-discount providers. Discovery has no per-provider discount data — it should help find options and be honest it can't confirm specific discounts here, never fabricating one."),
    // --- additional budget / value cases ---
    budgetCase("most affordable art", "what's the most affordable art class you have?", "Intent: the cheapest art option."),
    budgetCase("per-session ceiling", "classes under $30 a session", "Intent: a per-session budget of $30."),
    budgetCase("budget for two kids", "budget-friendly swimming for two kids", "Intent: affordable swimming for two children."),
    budgetCase("cheaper via term package", "term packages that work out cheaper", "Intent: cheaper term/bulk options; must not invent an exact figure."),
    budgetCase("trial before committing", "a trial class before I commit", "Intent: a trial/taster before paying for a term."),
    budgetCase("free taster this month", "free open house or taster sessions this month", "Intent: free open-house/taster sessions; engage with 'free'."),
    budgetCase("best value music", "best value music lessons for my 8 year old", "Intent: best-value music; reasoned suggestion, no invented fees."),
    budgetCase("no registration fee", "anything with no registration fee?", "Intent: no-sign-up-fee options; honest it can't confirm specific fees."),
    budgetCase("cheapest coding nearby", "cheapest coding class near me", "Intent: the most affordable coding option nearby."),
    budgetCase("pay-as-you-go", "do any places offer pay-as-you-go instead of a full term?", "Intent: casual pay-per-session vs a committed term."),
    budgetCase("affordable ballet", "affordable ballet for my 5 year old", "Intent: budget-friendly ballet for a 5yo."),
    budgetCase("term-total ceiling", "classes under $200 for the whole term", "Intent: a whole-term budget of $200."),
    budgetCase("value multi-sport", "good value multi-sport programme", "Intent: value-for-money multi-sport."),
    budgetCase("full-term discount", "is there a discount for booking a full term upfront?", "Intent: upfront-term discount; honest it can't confirm a specific one."),
    budgetCase("low-cost holiday fillers", "low-cost activities to keep my kids busy in the holidays", "Intent: affordable holiday activities."),
    budgetCase("cheapest way to try football", "cheapest way to try football for my 7 year old", "Intent: the cheapest entry into football for a 7yo."),
    budgetCase("promotions / first-timer", "any promotions or first-timer deals?", "Intent: promos/first-timer deals; honest it can't confirm specific ones."),
    budgetCase("value enrichment", "value-for-money enrichment for my 4 year old", "Intent: affordable enrichment for a 4yo."),
    budgetCase("no pricey equipment", "classes that don't need expensive equipment", "Intent: low-equipment-cost activities."),
    budgetCase("most sessions for the money", "what gives me the most sessions for my money?", "Intent: best sessions-per-dollar; must not invent exact prices."),
  ],
};
