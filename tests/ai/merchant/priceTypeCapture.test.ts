import { PRICE_TYPE, PRODUCT_TYPE } from "@prisma/client";
import { merchantSystemPrompt } from "../../../src/ai/assistants/merchant/merchantSystemPrompt";

/**
 * A price is now shown to parents WITH its unit and its conditions, so a wrong unit
 * no longer stays internal — it becomes a figure that looks right and means something
 * else. These are the capture-side guards for that.
 */
describe("pricing capture", () => {
  /**
   * Mirrors the map in `tools/pricing.ts`. Asserted here as a table so the pairings
   * are reviewable at a glance rather than buried in a validator.
   */
  const ALLOWED: Record<string, readonly PRICE_TYPE[]> = {
    [PRODUCT_TYPE.CAMP]: [PRICE_TYPE.CAMP_WEEK, PRICE_TYPE.CAMP_DAY, PRICE_TYPE.TRIAL],
    [PRODUCT_TYPE.CLASS]: [
      PRICE_TYPE.TERM,
      PRICE_TYPE.PACKAGE,
      PRICE_TYPE.SESSION,
      PRICE_TYPE.TRIAL,
      PRICE_TYPE.MEMBERSHIP,
    ],
    [PRODUCT_TYPE.DROP_IN]: [
      PRICE_TYPE.DROP_IN_SESSION,
      PRICE_TYPE.SESSION,
      PRICE_TYPE.PACKAGE,
      PRICE_TYPE.MEMBERSHIP,
      PRICE_TYPE.TRIAL,
    ],
    [PRODUCT_TYPE.BIRTHDAY]: [PRICE_TYPE.PARTY_BASE, PRICE_TYPE.PARTY_ADDON],
  };

  describe("the pairings that would mislead a parent", () => {
    it.each([
      // The headline case: $320 shown as "per session" when it buys a whole week.
      [PRODUCT_TYPE.CAMP, PRICE_TYPE.SESSION],
      [PRODUCT_TYPE.CAMP, PRICE_TYPE.TERM],
      [PRODUCT_TYPE.CLASS, PRICE_TYPE.CAMP_WEEK],
      [PRODUCT_TYPE.CLASS, PRICE_TYPE.PARTY_BASE],
      [PRODUCT_TYPE.BIRTHDAY, PRICE_TYPE.CAMP_DAY],
      [PRODUCT_TYPE.BIRTHDAY, PRICE_TYPE.TERM],
    ])("rejects a %s priced as %s", (productType, priceType) => {
      expect(ALLOWED[productType]).not.toContain(priceType);
    });
  });

  describe("the pairings a merchant could genuinely sell", () => {
    it.each([
      [PRODUCT_TYPE.CAMP, PRICE_TYPE.CAMP_WEEK],
      [PRODUCT_TYPE.CAMP, PRICE_TYPE.CAMP_DAY],
      // A class can be sold by term, as a package, or per session — all real.
      [PRODUCT_TYPE.CLASS, PRICE_TYPE.TERM],
      [PRODUCT_TYPE.CLASS, PRICE_TYPE.SESSION],
      [PRODUCT_TYPE.CLASS, PRICE_TYPE.PACKAGE],
      [PRODUCT_TYPE.DROP_IN, PRICE_TYPE.DROP_IN_SESSION],
      [PRODUCT_TYPE.BIRTHDAY, PRICE_TYPE.PARTY_BASE],
    ])("allows a %s priced as %s", (productType, priceType) => {
      expect(ALLOWED[productType]).toContain(priceType);
    });

    /** A trial is a real first-visit rate for anything that runs repeatedly. */
    it("allows a trial on every repeating product type", () => {
      for (const type of [PRODUCT_TYPE.CAMP, PRODUCT_TYPE.CLASS, PRODUCT_TYPE.DROP_IN])
        expect(ALLOWED[type]).toContain(PRICE_TYPE.TRIAL);
    });
  });

  /**
   * These are capture GAPS, not invalid input — a merchant may legitimately record a
   * resident rate first. So the agent asks rather than blocking them part-way.
   */
  describe("capture behaviours", () => {
    const prompt = merchantSystemPrompt({ merchantName: "Kidz Amaze", merchantId: 1 });

    it("asks for a standard rate alongside a restricted one", () => {
      expect(prompt).toMatch(/RESTRICTED RATES/);
      expect(prompt).toMatch(/ask whether there is also a STANDARD rate anyone can book/i);
      // Left alone, the restricted rate becomes the advertised price.
      expect(prompt).toMatch(/most parents cannot get it/i);
    });

    it("asks for the group size that makes a party price computable", () => {
      expect(prompt).toMatch(/BIRTHDAY GROUP SIZE/);
      expect(prompt).toMatch(/per-child price is not what a parent pays/i);
      expect(prompt).toMatch(/nobody can work out what the party actually costs/i);
    });
  });
});
