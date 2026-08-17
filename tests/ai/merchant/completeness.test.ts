import { PRICE_TYPE, PRODUCT_TYPE } from "@prisma/client";
import { productCompleteness } from "../../../src/ai/assistants/merchant/completeness";
import { merchantSystemPrompt } from "../../../src/ai/assistants/merchant/merchantSystemPrompt";

const LONG = "x".repeat(220);

const product = (over: Record<string, unknown> = {}) => ({
  productType: PRODUCT_TYPE.CLASS,
  description: LONG,
  tags: ["swim"],
  highlights: ["small groups"],
  categoryId: 3,
  // Answered, not merely absent: null here would be a real gap ("nobody has said
  // whether parents must book ahead"), which is the point of the tri-state.
  bookingRequired: true,
  ...over,
});

/**
 * The agent's measure was tool discipline — whether it was SAFE, not whether the
 * listing it produced was any use. A product with a thin description and no tags is
 * invisible to search, and nothing told the merchant so.
 */
describe("product completeness", () => {
  const fieldsOf = (input: Parameters<typeof productCompleteness>[0]) =>
    productCompleteness(input).gaps.map((gap) => gap.field);

  it("reports nothing missing on a complete product", () => {
    const result = productCompleteness({ product: product() });
    expect(result.gaps).toEqual([]);
    expect(result.score).toBe(1);
  });

  describe("findability", () => {
    it("catches a description too thin for search to match", () => {
      expect(fieldsOf({ product: product({ description: "Fun swim class." }) })).toContain(
        "description",
      );
    });

    it.each([
      ["tags", { tags: [] }],
      ["highlights", { highlights: [] }],
      ["category", { categoryId: null }],
    ])("catches missing %s", (field, over) => {
      expect(fieldsOf({ product: product(over) })).toContain(field);
    });
  });

  /**
   * A check is SKIPPED when its data was not loaded. Reporting "no price" because
   * nobody looked would send the agent chasing a gap that does not exist.
   */
  describe("judging only what was loaded", () => {
    it("says nothing about pricing when pricing was not read", () => {
      const result = productCompleteness({ product: product() });
      expect(result.gaps.map((g) => g.field)).not.toContain("pricing");
      expect(result.checked).toBe(5);
    });

    it("checks pricing once it is supplied", () => {
      expect(fieldsOf({ product: product(), pricing: [] })).toContain("pricing");
    });
  });

  describe("the price checks that reach a parent", () => {
    it("flags a price row with no unit", () => {
      const gaps = fieldsOf({
        product: product(),
        pricing: [{ priceType: null, isPublic: true }],
      });
      expect(gaps).toContain("priceType");
    });

    it("ignores a non-public row when judging whether a price exists", () => {
      expect(
        fieldsOf({
          product: product(),
          pricing: [{ priceType: PRICE_TYPE.TERM, isPublic: false }],
        }),
      ).toContain("pricing");
    });
  });

  describe("bookability", () => {
    it("flags a product with neither sessions nor dates", () => {
      expect(fieldsOf({ product: product(), schedules: [] })).toContain("schedule");
    });

    /** A camp's dates live on its options, not on a schedule. */
    it("accepts a camp whose dates are camp options", () => {
      expect(
        fieldsOf({
          product: product({ productType: PRODUCT_TYPE.CAMP }),
          schedules: [],
          campOptions: [{}],
        }),
      ).not.toContain("schedule");
    });
  });

  describe("per-type gaps", () => {
    it("treats a birthday's missing group size as critical", () => {
      const result = productCompleteness({
        product: product({ productType: PRODUCT_TYPE.BIRTHDAY }),
        birthdayDetails: { minKids: null, whatsIncluded: "cake" },
      });
      const gap = result.gaps.find((g) => g.field === "minKids");
      // Without it the per-child price is the only number, and it is not the cost.
      expect(gap?.weight).toBe("critical");
    });

    it("does not ask a class for birthday fields", () => {
      expect(
        fieldsOf({ product: product(), birthdayDetails: { minKids: null } }),
      ).not.toContain("minKids");
    });
  });

  it("raises the most costly gaps first", () => {
    const result = productCompleteness({
      product: product({ productType: PRODUCT_TYPE.BIRTHDAY, tags: [] }),
      pricing: [],
      birthdayDetails: { minKids: null, whatsIncluded: null },
    });
    expect(result.gaps[0].weight).toBe("critical");
    // Every gap carries a sentence to say, so the agent never reads out a field name.
    for (const gap of result.gaps) expect(gap.says.length).toBeGreaterThan(20);
  });
});

describe("how the agent uses it", () => {
  const prompt = merchantSystemPrompt({ merchantName: "Kidz Amaze", merchantId: 1 });

  it("raises critical gaps before the merchant moves on", () => {
    expect(prompt).toMatch(/WHAT'S STILL MISSING/);
    expect(prompt).toMatch(/raise CRITICAL gaps before the merchant moves on/i);
    expect(prompt).toMatch(/use the given sentence, never the field name/i);
  });

  /** A merchant will accept a draft and decline a form. */
  it("offers to do the work rather than demanding the field", () => {
    expect(prompt).toMatch(/OFFER TO DO IT, DON'T ASK FOR IT/);
    expect(prompt).toMatch(/want me to draft a description from what you've said/i);
    expect(prompt).toMatch(/never reply with a bare required-field complaint/i);
    // Drafting must not become inventing.
    expect(prompt).toMatch(/never invent facts you were not given/i);
  });
});
