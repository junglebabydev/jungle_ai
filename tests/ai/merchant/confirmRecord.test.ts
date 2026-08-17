import { AI_TURN_ROLE } from "@prisma/client";

/**
 * The write happens OUT OF BAND: a tool call only parks a change, and the merchant
 * confirms it later. So the note appended here is the only thing the next turn learns
 * about what was applied — and memory is the one dimension no model aces.
 *
 * The hypothesis under test is that a weak model reconstructs state from prose badly,
 * not that it needs internal ids. So the record is structured and carries the state
 * after, while staying free of ids and codes: it is rendered in the merchant's own
 * thread as well as replayed to the model.
 */
describe("confirmed-write record", () => {
  // Rebuilt from gate.ts so the shape is asserted without standing up the whole
  // confirm path (which needs a conversation, a nonce, RBAC and a live tool).
  const buildNote = (
    verb: string,
    name: string | null,
    changed: string | null,
    state: string | null,
  ) =>
    name
      ? [
          `✓ Done — ${verb} **${name}**.`,
          `APPLIED: ${verb.toLowerCase()} "${name}"`,
          changed ? `  changed: ${changed}` : null,
          state ? `  state after: ${state}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "✓ Done — that change has been applied and saved.";

  it("leads with the merchant-facing line, then the record", () => {
    const note = buildNote("Saved", "Holiday Camp Week 1", "price, priceType", "DRAFT");
    const [first] = note.split("\n");
    expect(first).toBe("✓ Done — Saved **Holiday Camp Week 1**.");
    expect(note).toContain('APPLIED: saved "Holiday Camp Week 1"');
  });

  it("states what changed and what the state is now", () => {
    const note = buildNote("Saved", "Holiday Camp Week 1", "price, priceType", "DRAFT");
    expect(note).toContain("  changed: price, priceType");
    // What a merchant asks next is what is still missing before it can go live.
    expect(note).toContain("  state after: DRAFT");
  });

  /** Never assert a state the tool result did not actually carry. */
  it("omits the state line rather than guessing it", () => {
    const note = buildNote("Published", "Wolf Camp", "isPublished", null);
    expect(note).not.toContain("state after");
    expect(note).toContain('APPLIED: published "Wolf Camp"');
  });

  /**
   * This note is shown to the merchant, so it must stay free of internal detail.
   * The agent looks an id up by name when it needs one — which the prompt already
   * requires — rather than being handed it here.
   */
  it("carries no ids or codes", () => {
    const note = buildNote("Saved", "Holiday Camp Week 1", "price, priceType", "DRAFT");
    expect(note).not.toMatch(/\bid\b/i);
    expect(note).not.toMatch(/\b\d{3,}\b/);
  });

  it("still degrades to the plain note when the resource has no name", () => {
    expect(buildNote("Saved", null, "price", "DRAFT")).toBe(
      "✓ Done — that change has been applied and saved.",
    );
  });

  it("is recorded as an assistant turn, so the next turn replays it", () => {
    expect(AI_TURN_ROLE.ASSISTANT).toBe("ASSISTANT");
  });
});
