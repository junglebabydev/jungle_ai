import { productDiscoverySystemPrompt } from "../../../src/ai/assistants/concierge/productDiscoveryPrompt";
import { merchantLocationSystemPrompt } from "../../../src/ai/assistants/concierge/merchantLocationPrompt";

/**
 * The search projection carries no price and no trustworthy ordering, and nothing
 * previously told the model to stop — so it answered anyway, fluently, and wrong.
 * These guards are the deterministic backstop, and each one is removed only when the
 * capability that replaces it ships with passing fixtures. Losing one silently is the
 * failure this suite exists to prevent.
 */
describe("concierge honesty guards", () => {
  const discovery = productDiscoverySystemPrompt({});
  const venue = merchantLocationSystemPrompt({ name: "Kidz Amaze" });

  /**
   * `priceFrom` is now projected, so the blanket "you never see prices" guard has been
   * REPLACED rather than kept — the rules below are its replacement and must ship in
   * the same change, or the prompt would deny seeing a price it is being handed.
   */
  describe("price", () => {
    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("requires the figure and its unit together on %s", (_name, prompt) => {
      // `priceType` is indexed now, so the stage-1 "no unit available" limit is
      // lifted — but a figure without its unit is still worse than no figure.
      expect(prompt).toMatch(/ALWAYS state the two together/i);
      expect(prompt).toMatch(/from \$320 per week/i);
      expect(prompt).toMatch(/with no `priceType`, give the figure with no unit at all/i);
      // $320/week ÷ 5 is a day rate nobody supplied, and two products priced by
      // different units are not comparable at all.
      expect(prompt).toMatch(/NEVER convert between units/i);
      expect(prompt).toMatch(/never compare two products whose `priceType` differs/i);
    });

    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("discloses a restricted rate and a group minimum on %s", (_name, prompt) => {
      expect(prompt).toMatch(/`priceQualified` means the cheapest rate is RESTRICTED/i);
      expect(prompt).toMatch(/never as the standard price/i);
      expect(prompt).toMatch(/`hasMinimumSpend` means a minimum group size applies/i);
      expect(prompt).toMatch(/a per-child figure is NOT what they will pay/i);
      // Free and not-listed are different answers; only one flag may say "free".
      expect(prompt).toMatch(/`isFree` is the ONLY thing that means free/i);
    });

    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("treats an absent price as NOT LISTED, never free, on %s", (_name, prompt) => {
      expect(prompt).toMatch(/when `priceFrom` is ABSENT the price is simply NOT LISTED/i);
      expect(prompt).toMatch(/does NOT mean free, cheap, or zero/i);
      expect(prompt).toMatch(/never fill the gap with a figure of your own/i);
    });

    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("still forbids unearned value judgements on %s", (_name, prompt) => {
      expect(prompt).toMatch(
        /never call something cheap, affordable, good value, or a bargain/i,
      );
    });

    /**
     * The venue chat quotes exact figures from `get_activity_details`, which is the
     * reason that surface exists. The shared rules constrain how the SEARCH price is
     * phrased and must never contradict it.
     */
    it("leaves the venue chat's exact-price tool intact", () => {
      expect(venue).toMatch(/get_activity_details/);
      expect(venue).toMatch(/GET THE SPECIFICS, DON'T GUESS/);
      expect(venue).not.toMatch(/you never see prices/i);
      expect(venue).not.toMatch(/search results carry NO price data/i);
    });

    it("no longer implies there is a price to ignore", () => {
      expect(discovery).toMatch(/acknowledge the budget rather than ignoring it/i);
      expect(discovery).not.toMatch(/acknowledge it rather than ignoring the price/i);
    });
  });

  /**
   * The 1b guard is REPLACED here: a superlative is now earned by actually sorting,
   * rather than forbidden outright. What must not return is the old failure — naming
   * the best of a sample of eight as the best in the catalogue.
   */
  describe("ranking", () => {
    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("still forbids a superlative from an unsorted sample on %s", (_name, prompt) => {
      expect(prompt).toMatch(/results are ordered by how well they MATCH unless you set `sort`/i);
      expect(prompt).toMatch(
        /never call anything the highest rated, the best, the top, or the cheapest/i,
      );
    });

    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("earns the superlative by sorting, and bounds the claim on %s", (_name, prompt) => {
      expect(prompt).toMatch(/ONLY then may you rank/i);
      // It ranked THIS search, not the catalogue — "the best camp in Singapore" when
      // the search was filtered to Orchard is the claim being prevented.
      expect(prompt).toMatch(/best rated among matching camps in Orchard/i);
      expect(prompt).toMatch(/never claim more than that/i);
    });

    it("explains why review volume beats a perfect score from three people", () => {
      expect(discovery).toMatch(/a 4\.8 from 200 reviews can rightly beat a 5\.0 from 3/i);
      expect(discovery).toMatch(/venues nobody has rated come last rather than being dropped/i);
      expect(discovery).toMatch(/the rating describes the venue, never the activity/i);
    });
  });

  /**
   * `gMapRating` is on Location; Product has no rating of any kind. So this number is
   * identical for every activity at one address and fires on EVERY result card of
   * EVERY search — the highest-frequency falsehood in the system, and the cheapest
   * to remove, because the number is real and only the attribution was wrong.
   */
  describe("venue rating attribution", () => {
    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("requires the rating to be attributed to the venue on %s", (_name, prompt) => {
      expect(prompt).toMatch(/`venueRating` and `venueReviews` are the Google rating of the PLACE/i);
      expect(prompt).toMatch(/the venue is rated 4\.3 across 678 reviews/i);
      expect(prompt).toMatch(
        /never say a camp, class, or activity is rated anything/i,
      );
    });

    it("tells the model the number cannot separate two activities at one venue", () => {
      expect(discovery).toMatch(/shared by every activity there/i);
      expect(discovery).toMatch(/never tell two activities at one venue apart|can never tell two activities at one venue apart/i);
    });
  });

  /**
   * Distance ranking has been live in production the whole time with nothing saying
   * what could be claimed about it — the same shape as every other falsehood here.
   * The reference point is the CENTRE of the area the parent named; nothing in this
   * service is ever told where the parent actually is.
   */
  describe("proximity", () => {
    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("names the reference point and never the parent on %s", (_name, prompt) => {
      expect(prompt).toMatch(/measured from the CENTRE OF THE AREA THE PARENT NAMED/i);
      expect(prompt).toMatch(/never from where they are/i);
      // "2km from you" is the specific claim that cannot be true.
      expect(prompt).toMatch(/about 2km from Tampines', never '2km from you'/i);
      expect(prompt).toMatch(/name the area every time/i);
    });

    it.each([
      ["discovery", discovery],
      ["venue chat", venue],
    ])("stays silent when nothing was measured on %s", (_name, prompt) => {
      expect(prompt).toMatch(/say nothing at all about distance, closeness or travel when `distanceKm` is absent/i);
      expect(prompt).toMatch(/never call something nearby, close, or convenient on your own/i);
      // No route, no traffic, no starting point — so no travel time either.
      expect(prompt).toMatch(/never estimate a travel time/i);
    });
  });

  /**
   * Merchants can now record the questions parents ask before booking. The rules that
   * governed them were written when the catalogue had no answers, so the risk has
   * inverted: not "don't invent parking" but "don't read an unanswered field as a no".
   */
  describe("pre-booking answers", () => {
    it("answers from the venue's own words when they were given", () => {
      expect(venue).toMatch(/THE PRE-BOOKING ANSWERS ARE IN THE BLOCK WHEN THE VENUE GAVE THEM/i);
      expect(venue).toMatch(/answer straight from them, in the venue's own words/i);
    });

    it("never turns an unanswered field into a no", () => {
      expect(venue).toMatch(/their ABSENCE is not a no/i);
      expect(venue).toMatch(/means the venue has not said/i);
      // The two specific falsehoods a missing line could otherwise become.
      expect(venue).toMatch(/never turn a missing line into "there's no parking"/i);
      expect(venue).toMatch(/you don't need to book/i);
    });

    /** The blanket refusal must NOT return — it would deny data the venue supplied. */
    it("no longer refuses the whole category outright", () => {
      expect(venue).not.toMatch(/never mention parking/i);
      expect(venue).not.toMatch(/cannot answer questions about facilities/i);
    });
  });

  describe("exclusions", () => {
    /**
     * The 1c guard has been REPLACED by the capability it stood in for. An area can
     * now be excluded for real; a provider still cannot, because a name has no
     * reliable resolution to an id and the wrong id excludes the wrong provider.
     */
    it("routes an area exclusion to the field instead of declining it", () => {
      expect(discovery).toMatch(/put that area in `excludeDistrict` and leave `district` unset/i);
      // The original failure: the excluded area was set as the area to search, so
      // the parent got back precisely what they ruled out.
      expect(discovery).toMatch(/returns exactly what they ruled out/i);
      expect(discovery).not.toMatch(/you cannot filter something out/i);
    });

    it("still declines to exclude a provider", () => {
      expect(discovery).toMatch(/excluding a PROVIDER is still not something you can do/i);
      expect(discovery).toMatch(/rather than filtering by area instead/i);
    });

    /**
     * Deliberately NOT shared: offering to search a different area would break the
     * venue chat's one-provider confinement, which is a hard boundary there.
     */
    it("is absent from the venue chat, which cannot leave its provider", () => {
      expect(venue).not.toMatch(/EXCLUSIONS:/);
      expect(venue).toMatch(/ONE PROVIDER ONLY/);
    });
  });
});
