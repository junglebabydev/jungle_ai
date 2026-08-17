import {
  parseRetractions,
  buildDistrictMatchers,
  CARRIED_FILTER_KEYS,
} from "../../../src/utils/searchQueryParser";
import {
  accumulateContext,
  switchedProductType,
} from "../../../src/ai/assistants/concierge/loop";

/**
 * Conversation state could add and overwrite a filter but never remove one, so
 * "forget the budget" and "start over" were instructions the concierge had no
 * mechanism to obey — and it reported obeying them regardless. This is the parsing
 * half; it needs no model, which makes it the cheapest of the honesty fixes to prove.
 */
describe("parseRetractions", () => {
  it("returns nothing for an ordinary search, so a normal turn is untouched", () => {
    expect(parseRetractions("swimming camps in Orchard for a 5 year old")).toEqual([]);
    expect(parseRetractions("anything cheaper?")).toEqual([]);
    expect(parseRetractions("")).toEqual([]);
  });

  describe("dropping one filter", () => {
    it("clears the ceiling AND the cheapest-first ask together", () => {
      // Clearing only `maxPrice` would leave results still ordered by price, which
      // is not what "forget the budget" means to a parent.
      expect(parseRetractions("forget the budget")).toEqual(
        expect.arrayContaining(["maxPrice", "cheap"]),
      );
    });

    it.each([
      ["forget the budget", "maxPrice"],
      ["drop the price filter", "maxPrice"],
      ["remove that budget", "maxPrice"],
      ["undo the price filter", "maxPrice"],
      ["ignore the cost", "maxPrice"],
      ["forget the area", "district"],
      ["clear the location", "nearDistrict"],
      ["remove the age", "age"],
      ["drop the days", "daysOfWeek"],
    ])("reads %s as clearing %s", (message, key) => {
      expect(parseRetractions(message)).toContain(key);
    });

    it("clears every way of naming an area, since any of them could be set", () => {
      const cleared = parseRetractions("forget the area");
      expect(cleared).toEqual(
        expect.arrayContaining(["district", "nearDistrict", "region"]),
      );
    });
  });

  describe("starting over", () => {
    it.each([
      ["start over"],
      ["let's start again"],
      ["reset"],
      ["forget everything"],
      ["never mind all that"],
    ])("clears the whole accumulator on %s", (message) => {
      expect(parseRetractions(message).sort()).toEqual([...CARRIED_FILTER_KEYS].sort());
    });
  });

  /**
   * The verb and the noun have to sit together. A bare verb match reads "drop-in
   * classes" as a retraction; a bare noun match reads "what's the price range" as one.
   * Both would silently delete a filter the parent still wants.
   */
  describe("does not fire on ordinary phrasing", () => {
    it.each([
      ["drop-in classes near me"],
      ["drop in sessions in Punggol"],
      ["what is the price range"],
      ["something in a different area"],
      ["a class for my 5 year old"],
      ["are there cheaper camps"],
    ])("leaves %s alone", (message) => {
      expect(parseRetractions(message)).toEqual([]);
    });
  });

  it("keeps its key list in step with what the accumulator carries", () => {
    // A key the accumulator carries but this list omits is a filter a parent can set
    // and then never get rid of.
    expect(CARRIED_FILTER_KEYS).toContain("activity");
    expect(CARRIED_FILTER_KEYS).toContain("maxPrice");
    expect(new Set(CARRIED_FILTER_KEYS).size).toBe(CARRIED_FILTER_KEYS.length);
  });
});

/**
 * The worked example from the design review, end to end. Turns 4 and 5 each produced
 * a false statement: the budget carried into a product type it could not apply to,
 * and "undo the price filter" was answered with a confirmation and no change.
 */
describe("multi-turn state", () => {
  const turns = (...messages: string[]) =>
    messages.map((content) => ({ role: "USER", content })) as never;

  // An area is only recognisable against the real district vocabulary, which the
  // loop loads from the database; supply a small one so "in Orchard" parses here too.
  const districts = buildDistrictMatchers(["Orchard", "Punggol", "Tampines"]);

  const stateAfter = (...messages: string[]) => {
    const history = turns(...messages.slice(0, -1));
    return accumulateContext(history, messages[messages.length - 1], districts);
  };

  it("drops the budget but keeps everything else", () => {
    const state = stateAfter(
      "swimming camps in Orchard",
      "under $600",
      "forget the budget",
    );
    expect(state.maxPrice).toBeUndefined();
    expect(state.cheap).toBeUndefined();
    expect(state.district).toBe("Orchard");
    expect(state.activity).toBeTruthy();
  });

  it("retracts then re-sets within one message", () => {
    // Order matters: retract before merging this message's own filters, or the new
    // number is wiped by the clear that was meant to precede it.
    const state = stateAfter(
      "swimming camps",
      "under $600",
      "forget the budget, make it under $300",
    );
    expect(state.maxPrice).toBe(300);
  });

  it("wipes the slate on start over", () => {
    const state = stateAfter("swimming camps in Punggol", "under $600", "start over");
    for (const key of CARRIED_FILTER_KEYS) expect(state[key]).toBeUndefined();
  });

  it("notices a product-type swap, which is what invalidates the budget", () => {
    expect(switchedProductType("actually make that classes", turns("show me camps"))).toBe(
      true,
    );
    // Repeating the same kind is not a swap, and naming none changes nothing.
    expect(switchedProductType("more camps please", turns("show me camps"))).toBe(false);
    expect(switchedProductType("anything in Punggol", turns("show me camps"))).toBe(false);
  });
});
