import { productDiscoverySystemPrompt } from "../../../src/ai/assistants/concierge/productDiscoveryPrompt";

describe("productDiscoverySystemPrompt", () => {
  // No longer "guides toward Camps": the search already switches to camps when the
  // parent names them, so sending them to another tab was advice for results the
  // grid is showing. See the "tab binding matches what the search actually does"
  // block below.
  it("binds to the ACTIVITIES (merchants) tab", () => {
    const p = productDiscoverySystemPrompt({ sections: ["merchants"] });
    expect(p).toContain("ACTIVITIES tab");
    expect(p).toContain("providers"); // shows providers here
    expect(p).toMatch(/a search here returns providers/i);
  });

  it("binds to the CAMPS (products) tab and guides toward Activities", () => {
    const p = productDiscoverySystemPrompt({ sections: ["products"] });
    expect(p).toContain("CAMPS tab");
    expect(p).toContain("ACTIVITIES tab");
    expect(p).toMatch(/every search here returns those/i);
  });

  it("adds no cross-tab guidance when no section is pinned (both)", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).not.toMatch(/returns (providers|those) only/i);
    expect(p).toContain("both");
  });

  it("carries the production guardrails (no tables, no emojis, one tool)", () => {
    const p = productDiscoverySystemPrompt({ sections: ["products"] });
    // The rule reads "Never output a catalogue of results — no table, …"; the older
    // assertion matched a phrasing the prompt no longer uses.
    expect(p).toMatch(/never output a catalogue of results/i);
    expect(p).toMatch(/no table/i);
    expect(p).toMatch(/no headings, tables, links, code, numbered lists, or emojis/i);
    expect(p).toContain("search_activities");
    expect(p).toMatch(/never[^.]*invent/i);
  });

  it("emits NO chip tags — no SUGGESTIONS and no QUESTIONS line", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).not.toContain("SUGGESTIONS:");
    expect(p).not.toContain("QUESTIONS:");
  });

  it("is a warm human guide that always searches first", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toMatch(/warm, capable guide/i);
    // Search-first is unconditional — the guide never dead-ends on a term.
    expect(p).toMatch(/SEARCH FIRST/i);
    expect(p).toMatch(/never refuse, apologise/i);
  });

  // The framework is unfinalised as a product and the frontend renders no trail
  // chips, so the agent must not be the one channel that ships its vocabulary to
  // parents. Filtering still happens — the server infers trails from the raw
  // message — but nothing parent-facing may name it.
  it("ships no Explorer Map vocabulary to parents", () => {
    const p = productDiscoverySystemPrompt({});
    for (const banned of [
      "JUNGLE EXPLORER MAP",
      "Explorer Map",
      "Body & Movement",
      "Curiosity & Discovery",
      "Imagination & Expression",
      "People & Heart",
      "new ground",
      "their anchor",
      "Trail coverage",
      "wholeDevelopmentComplement",
    ]) {
      expect(p).not.toMatch(new RegExp(banned.replace(/[&]/g, "\\&"), "i"));
    }
  });

  it("still answers a plan request with substance instead of a bare question", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toMatch(/PLAN requests/i);
    expect(p).toMatch(/don't send them away empty/i);
    expect(p).toMatch(/ask ONE question/i);
    // No required set, checklist, or anything framed as a developmental need.
    expect(p).toMatch(/never present a required set, a checklist/i);
  });

  // `tools/search.ts` switches sections to ["products"] when the parent names a
  // kind of activity, on every tab that does not pin a product type. The prompt used
  // to claim the tab was fixed and tell them to switch tabs — advice that is wrong
  // for results already on screen. These pin the two together.
  describe("tab binding matches what the search actually does", () => {
    it.each<[string]>([["merchants"], ["packages"]])(
      "warns the %s tab that a named activity kind switches the search",
      (section: string) => {
        const p = productDiscoverySystemPrompt({ sections: [section as never] });
        expect(p).toMatch(/the search switches to those activities on its own/i);
        expect(p).toMatch(/never tell them to switch tabs for it/i);
        // The old, now-false promise.
        expect(p).not.toMatch(/that is fixed/i);
      },
    );

    it("keeps the CAMPS tab fixed, because it pins the product type", () => {
      const p = productDiscoverySystemPrompt({ sections: ["products"] });
      expect(p).toMatch(/naming a kind .* just narrows to it/i);
      expect(p).not.toMatch(/the search switches to those activities on its own/i);
    });

    it("warns the unpinned browse too", () => {
      const p = productDiscoverySystemPrompt({});
      expect(p).toMatch(/the search switches to those activities on its own/i);
    });
  });

  it("forces common-word provider searches and preserves names containing Camp", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toContain("'Wolf Camp' stays query:'Wolf Camp'");
    expect(p).toMatch(/Any word can be a provider name/i);
    expect(p).toMatch(/claim a name was not found/i);
  });
});
