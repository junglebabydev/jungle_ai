import {
  coerceNumericData,
  stripVisibilityFlags,
} from "../../../src/ai/assistants/merchant/tools/common";

describe("agent/common: coerceNumericData", () => {
  it("coerces allowlisted numeric-string fields to numbers", () => {
    const out = coerceNumericData({
      maxCapacity: "50",
      price: "20",
      name: "Tiny Tots",
    }) as Record<string, unknown>;
    expect(out.maxCapacity).toBe(50);
    expect(out.price).toBe(20);
    expect(out.name).toBe("Tiny Tots"); // not allowlisted → untouched
  });

  it("maps day names to 0–6", () => {
    expect((coerceNumericData({ dayOfWeek: "MONDAY" }) as { dayOfWeek: unknown }).dayOfWeek).toBe(1);
    expect((coerceNumericData({ dayOfWeek: "sunday" }) as { dayOfWeek: unknown }).dayOfWeek).toBe(0);
  });

  it("leaves genuinely-string fields (phone) intact", () => {
    expect((coerceNumericData({ phone: "6590001234" }) as { phone: unknown }).phone).toBe("6590001234");
  });

  it("recurses into nested objects (product/details)", () => {
    const out = coerceNumericData({ details: { duration: "45" } }) as {
      details: { duration: unknown };
    };
    expect(out.details.duration).toBe(45);
  });
});

describe("agent/common: stripVisibilityFlags", () => {
  it("removes publish/archive flags so an upsert can never go live", () => {
    const out = stripVisibilityFlags({
      name: "Ballet",
      isPublished: true,
      isPublic: true,
      isArchived: true,
      publishedAt: "x",
      archivedAt: "y",
    });
    expect(out).toEqual({ name: "Ballet" });
  });
});
