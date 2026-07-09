import { productDiscoverySystemPrompt } from "../../../src/ai/assistants/concierge/productDiscoveryPrompt";

describe("productDiscoverySystemPrompt", () => {
  it("binds to the ACTIVITIES (merchants) tab and guides toward Camps", () => {
    const p = productDiscoverySystemPrompt({ sections: ["merchants"] });
    expect(p).toContain("ACTIVITIES tab");
    expect(p).toContain("providers"); // shows providers here
    expect(p).toContain("CAMPS tab"); // tells them to switch for camps
    expect(p).toMatch(/returns providers only/i);
  });

  it("binds to the CAMPS (products) tab and guides toward Activities", () => {
    const p = productDiscoverySystemPrompt({ sections: ["products"] });
    expect(p).toContain("CAMPS tab");
    expect(p).toContain("ACTIVITIES tab");
    expect(p).toMatch(/returns those only/i);
  });

  it("adds no cross-tab guidance when no section is pinned (both)", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).not.toMatch(/returns (providers|those) only/i);
    expect(p).toContain("both");
  });

  it("carries the production guardrails (no tables, no emojis, one tool)", () => {
    const p = productDiscoverySystemPrompt({ sections: ["products"] });
    expect(p).toMatch(/never output a table/i);
    expect(p).toMatch(/no emojis/i);
    expect(p).toContain("search_activities");
    expect(p).toMatch(/never[^.]*invent/i);
  });

  it("emits NO chip tags — no SUGGESTIONS and no QUESTIONS line", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).not.toContain("SUGGESTIONS:");
    expect(p).not.toContain("QUESTIONS:");
  });

  it("is a warm human guide that always searches first and uses the Explorer Map", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toMatch(/warm, capable guide/i);
    // Search-first is unconditional — the guide never dead-ends on a term.
    expect(p).toMatch(/SEARCH FIRST/i);
    expect(p).toMatch(/never refuse, apologise/i);
    expect(p).toMatch(/Explorer Map/i);
    // The four-trail development-plan flow.
    expect(p).toMatch(/DEVELOPMENT-PLAN requests/i);
  });

  it("contains the Explorer Map without scoring or collecting identity", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toContain("JUNGLE EXPLORER MAP");
    expect(p).toContain("Physical / Body & Movement");
    expect(p).toContain("Cognitive / Curiosity & Discovery");
    expect(p).toContain("Creative / Imagination & Expression");
    expect(p).toContain("Social / People & Heart");
    expect(p).toMatch(/never score, rank, diagnose, label/i);
    expect(p).toMatch(/never request a name, email, phone/i);
    expect(p).toMatch(/Personalise ONLY from what the parent says/i);
  });

  it("forces common-word provider searches and preserves names containing Camp", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toContain("'Wolf Camp' stays query:'Wolf Camp'");
    expect(p).toMatch(/Any word can be a provider name/i);
    expect(p).toMatch(/claim a name was not found/i);
  });

  it("builds complementary kits without replacing the requested activity cards", () => {
    const p = productDiscoverySystemPrompt({});
    expect(p).toMatch(/NEW GROUND complement/i);
    expect(p).toContain("`wholeDevelopmentComplement`");
    expect(p).toMatch(/call the tool ONCE/i);
    expect(p).toMatch(/exact provider\/brand lookup/i);
    // New ground on exploration, not on a pure refinement.
    expect(p).toMatch(/EXPLORATORY/i);
  });
});
