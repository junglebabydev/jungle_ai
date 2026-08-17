import { compactResults } from "../../../src/ai/assistants/concierge/tools/search";
import { productDiscoverySystemPrompt } from "../../../src/ai/assistants/concierge/productDiscoveryPrompt";
import type { SearchResponseDTO } from "../../../src/shared/dtos/SearchDTOs";

const envelope = (over: Partial<SearchResponseDTO> = {}): SearchResponseDTO =>
  ({
    query: "",
    parsed: {},
    products: {
      data: [
        {
          id: 1,
          name: "Rainy Day Play",
          productType: "DROP_IN",
          ageMin: 2,
          ageMax: 5,
          location: { sgDistrict: "Punggol" },
          merchant: { name: "Play Co" },
        },
      ],
      total: 1,
      totalPages: 1,
      page: 1,
      pageSize: 20,
      order: "desc",
    },
    merchants: { data: [], total: 0, totalPages: 1, page: 1, pageSize: 20, order: "desc" },
    ...over,
  }) as unknown as SearchResponseDTO;

/**
 * `guaranteeResults` relaxes the parent's ask so the grid is never empty. Only its
 * LAST rung used to set `broadened`, and the flag never reached the model at all — so
 * the two middle rungs presented a relaxed grid as an exact answer to both the model
 * and the frontend label, and rung 3 dropped the parent's budget with nobody told.
 */
describe("broadened disclosure", () => {
  describe("the model projection", () => {
    it("carries nothing when the search was a real answer", () => {
      const out = compactResults(envelope()) as Record<string, unknown>;
      expect(out).not.toHaveProperty("broadened");
      expect(out).not.toHaveProperty("relaxed");
    });

    it("carries the flag AND what was dropped when the ladder relaxed the ask", () => {
      const out = compactResults(
        envelope({ broadened: true, relaxed: ["activity", "budget"] }),
      ) as Record<string, unknown>;
      expect(out.broadened).toBe(true);
      expect(out.relaxed).toEqual(["activity", "budget"]);
    });

    /**
     * A flag with no list would tell the model "something was relaxed" without saying
     * what — it would have to guess, which is the failure mode being fixed.
     */
    it("never reports broadening without a list to name", () => {
      const out = compactResults(envelope({ broadened: true })) as Record<
        string,
        unknown
      >;
      expect(out.broadened).toBe(true);
      expect(out.relaxed).toEqual([]);
    });
  });

  /**
   * The price was real at every layer except the model's input: indexed, filtered on,
   * sorted by, shown on the cards — and stripped from the projection. Asked the cost,
   * the agent had nothing to answer from, so it interpolated.
   */
  describe("the price projection", () => {
    const productWith = (over: Record<string, unknown>) =>
      compactResults(
        envelope({
          products: {
            data: [
              {
                id: 1,
                name: "Wolf Camp",
                productType: "CAMP",
                ageMin: 5,
                ageMax: 9,
                location: { sgDistrict: "Orchard" },
                merchant: { name: "Wolf Co" },
                ...over,
              },
            ],
            total: 1,
            totalPages: 1,
            page: 1,
            pageSize: 20,
            order: "desc",
          },
        } as never),
      ) as { products: Array<Record<string, unknown>> };

    it("hands the model the indexed price", () => {
      expect(productWith({ priceFrom: 320 }).products[0].priceFrom).toBe(320);
    });

    /**
     * Absent must stay absent all the way to the model. Asserted on the serialised
     * form because that is what the model is actually handed — and a `null` reaching
     * it would invite exactly the reading the prompt forbids, that the product is free.
     */
    it("sends no price at all when the product has no usable one", () => {
      const row = productWith({}).products[0];
      const asSeenByModel = JSON.parse(JSON.stringify(row));
      expect(asSeenByModel).not.toHaveProperty("priceFrom");
      expect(row.priceFrom).toBeUndefined();
    });
  });

  /**
   * Two products can share a name across providers, and the model saw near-identical
   * rows with nothing to tell them apart — so "tell me about the second one" had no
   * referent. A POSITION, not a database id, so the id redaction stays untouched.
   */
  describe("the result ordinal", () => {
    it("numbers the results in the order the parent sees them", () => {
      const out = compactResults(envelope()) as {
        products: Array<Record<string, unknown>>;
      };
      expect(out.products[0].ref).toBe(1);
    });

    it("carries no database id alongside it", () => {
      const row = compactResults(envelope()) as {
        products: Array<Record<string, unknown>>;
      };
      expect(row.products[0]).not.toHaveProperty("id");
      expect(row.products[0]).not.toHaveProperty("productID");
    });

    it("is explained to the model, and told not to print it", () => {
      const prompt = productDiscoverySystemPrompt({});
      expect(prompt).toMatch(/REFERRING BACK/);
      expect(prompt).toMatch(/the second one/i);
      expect(prompt).toMatch(/never print the ref itself; name the activity/i);
    });
  });

  describe("the reply rule", () => {
    const prompt = productDiscoverySystemPrompt({});

    it("requires the drop to be named in the first line, not buried", () => {
      expect(prompt).toMatch(/BROADENED RESULTS/);
      expect(prompt).toMatch(/your exact search found NOTHING/i);
      expect(prompt).toMatch(/say so in your FIRST line/i);
      expect(prompt).toMatch(/close alternatives, never as matches/i);
    });

    // The rung-3 case: a budget can be dropped to fill the grid, and a parent who
    // set one must not be shown over-budget results described as within it.
    it("calls out a dropped budget specifically", () => {
      expect(prompt).toMatch(/if `relaxed` includes budget/i);
      expect(prompt).toMatch(/not filtered to their budget/i);
    });

    it("forbids presenting a broadened set as the answer", () => {
      expect(prompt).toMatch(
        /never present a broadened set as an answer to what they asked/i,
      );
    });
  });
});
