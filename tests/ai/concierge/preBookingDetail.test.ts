import { merchantLocationSystemPrompt } from "../../../src/ai/assistants/concierge/merchantLocationPrompt";

/**
 * The venue guide could describe a place and then decline the questions that decide a
 * booking — what's included, how long it runs, cancellation. Those answers existed on
 * the per-type detail models all along and simply were not loaded, so the surface
 * looked like a data gap when it was a projection gap.
 */
describe("pre-booking detail on the venue surface", () => {
  const prompt = merchantLocationSystemPrompt({ name: "Kidz Amaze" });

  it("tells the guide to answer from the listed detail", () => {
    expect(prompt).toMatch(/PRE-BOOKING DETAIL/);
    expect(prompt).toMatch(/what's included, how long they run, the group size, and cancellation terms/i);
    expect(prompt).toMatch(/answer straight from those when asked/i);
  });

  /**
   * Improvising a cancellation policy is the same severity as improvising a refund
   * policy, so an absent detail must be declined rather than filled in.
   */
  it("requires 'not listed' rather than an invented policy", () => {
    expect(prompt).toMatch(/say it isn't listed and point them to the contact or booking link/i);
    expect(prompt).toMatch(/never invent a policy, a duration, or what a package covers/i);
  });

  /**
   * A $20 per-child party with a 15-child minimum costs $300. Quoting the per-child
   * figure as the total is the party-package trap, and group size is what prevents it.
   */
  it("stops a per-child birthday price being presented as the total", () => {
    expect(prompt).toMatch(/a birthday's group size is part of its price/i);
    expect(prompt).toMatch(/a per-child figure is not the total/i);
    expect(prompt).toMatch(/never present the per-child price as the whole cost/i);
  });

  it("keeps the exact-price tool as the source for figures", () => {
    expect(prompt).toMatch(/get_activity_details/);
    expect(prompt).toMatch(/GET THE SPECIFICS, DON'T GUESS/);
  });
});
