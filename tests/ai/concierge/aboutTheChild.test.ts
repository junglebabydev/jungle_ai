import { productDiscoverySystemPrompt } from "../../../src/ai/assistants/concierge/productDiscoveryPrompt";
import { merchantLocationSystemPrompt } from "../../../src/ai/assistants/concierge/merchantLocationPrompt";
import { CONCIERGE_ABOUT_THE_CHILD } from "../../../src/ai/assistants/concierge/promptShared";

/**
 * These are safeguarding rules, and they used to live INSIDE the Explorer Map block.
 * This suite is the reason they can be moved or the framework deleted without anyone
 * noticing they went with it: it asserts each rule on BOTH surfaces, keyed on the
 * standalone block rather than on any framework wording.
 */
describe("ABOUT THE CHILD safeguarding rules", () => {
  const surfaces: Array<[string, string]> = [
    ["discovery", productDiscoverySystemPrompt({})],
    ["discovery with a child profile", productDiscoverySystemPrompt({
      childProfile: { age: 5, mentionedActivities: ["swimming"] },
    })],
    ["venue chat", merchantLocationSystemPrompt({ name: "Kidz Amaze" })],
  ];

  it.each(surfaces)("composes the standalone block into the %s prompt", (_name, prompt) => {
    expect(prompt).toContain(CONCIERGE_ABOUT_THE_CHILD);
    expect(prompt).toContain("ABOUT THE CHILD:");
  });

  it.each(surfaces)("forbids assessing the child on the %s surface", (_name, prompt) => {
    expect(prompt).toMatch(/never score, rank, diagnose, label, or assess a child/i);
    expect(prompt).toMatch(/never say a child is behind, weak, lacking/i);
    expect(prompt).toMatch(/describe the FIT instead/i);
  });

  it.each(surfaces)("forbids collecting identifying details on the %s surface", (_name, prompt) => {
    expect(prompt).toMatch(/never request a name, email, phone, school, or medical details/i);
    expect(prompt).toMatch(/never claim to remember a profile beyond this chat/i);
    expect(prompt).toMatch(/personalise ONLY from what the parent says in this chat/i);
  });

  it.each(surfaces)("frames the untried as an invitation on the %s surface", (_name, prompt) => {
    expect(prompt).toMatch(/frame anything untried as an invitation worth trying/i);
    expect(prompt).toMatch(/never as a gap or something the child needs/i);
  });

  /**
   * The extracted wording must not depend on the Explorer Map, or deleting the
   * framework would take the safeguards with it — the exact failure this guards.
   */
  it("is framework-free, so it survives the Explorer Map being removed", () => {
    expect(CONCIERGE_ABOUT_THE_CHILD).not.toMatch(/trail/i);
    expect(CONCIERGE_ABOUT_THE_CHILD).not.toMatch(/explorer map/i);
    expect(CONCIERGE_ABOUT_THE_CHILD).not.toMatch(/new ground/i);
    expect(CONCIERGE_ABOUT_THE_CHILD).not.toMatch(
      /body & movement|curiosity & discovery|imagination & expression|people & heart/i,
    );
  });

  it("states each rule once, so the two surfaces cannot drift apart", () => {
    const discovery = productDiscoverySystemPrompt({});
    const occurrences = discovery.split("ABOUT THE CHILD:").length - 1;
    expect(occurrences).toBe(1);
    expect(
      discovery.split("Never score, rank, diagnose, label, or assess a child").length - 1,
    ).toBe(1);
  });
});
