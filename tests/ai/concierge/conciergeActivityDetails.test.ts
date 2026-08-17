// Eval-style coverage for the merchant-location concierge's per-activity detail
// tool (`get_activity_details`): a series of parent questions in one place, the
// chat's history awareness, a plain search, and the PUBLISHED-ONLY gating that
// makes this safe to expose to anonymous parents. The LLM + service layer are
// mocked so we assert the loop/tool behaviour deterministically.

jest.mock("../../../src/lib/openrouter", () => ({
  __esModule: true,
  streamChatCompletion: jest.fn(),
  getActiveModel: jest.fn(() => "test-model"),
  getConciergeModels: jest.fn(() => ["test-model"]),
  getConciergeProviderOrder: jest.fn(() => []),
}));

jest.mock("../../../src/ai/shared/evalLog", () => ({
  __esModule: true,
  emitConciergeTelemetry: jest.fn(),
}));

jest.mock("../../../src/services", () => ({
  __esModule: true,
  ServiceLocator: {
    ConciergeConversationService: {
      internal: {
        getRecentTurns: jest.fn().mockResolvedValue([]),
        appendTurns: jest.fn().mockResolvedValue(2),
      },
    },
    MerchantService: {
      public: {
        getMerchantById: jest.fn().mockResolvedValue({ name: "Swim Masters" }),
      },
    },
    LocationService: {
      public: {
        getLocationById: jest.fn().mockResolvedValue({
          name: "Swim Masters Tampines",
          sgDistrict: "Tampines",
          locationType: "INDOOR",
          details: { description: "Learn-to-swim specialists." },
        }),
      },
      // Every turn builds district matchers from the live district list before it
      // reaches the model, so the loop throws without this even on venue-only cases.
      internal: {
        getDistinctDistricts: jest
          .fn()
          .mockResolvedValue(["Tampines", "Punggol", "Orchard", "Bishan"]),
      },
    },
    PricingService: { public: { listPricingByProduct: jest.fn() } },
    PackageTemplateService: {
      public: { listPackageTemplatesByProduct: jest.fn() },
    },
    CampDetailsService: { public: { getCampDetailsByProduct: jest.fn() } },
    ScheduleService: { public: { listSchedulesByProduct: jest.fn() } },
    SessionService: { public: { listSessionsByProduct: jest.fn() } },
    // buildVenueContext preloads the location's activity categories.
    ProductCategoryService: {
      public: { listProductCategorie: jest.fn().mockResolvedValue([]) },
    },
  },
}));

import { AI_TURN_ROLE } from "@prisma/client";
jest.mock("../../../src/lib/searchClient", () => ({
  __esModule: true,
  searchClient: {
    search: jest.fn(),
    getCatalogueCounts: jest.fn(),
    searchIds: jest.fn(),
    reindex: jest.fn(),
  },
}));

import { streamChatCompletion } from "../../../src/lib/openrouter";
import { searchClient } from "../../../src/lib/searchClient";
import { ServiceLocator } from "../../../src/services";
import {
  runConciergeTurn,
  _resetVenueContextCache,
} from "../../../src/ai/assistants/concierge/loop";
import { _resetSearchCache } from "../../../src/ai/assistants/concierge/tools/search";

const streamMock = streamChatCompletion as jest.Mock;
const search = searchClient.search as jest.Mock;
const getRecentTurns = ServiceLocator.ConciergeConversationService.internal
  .getRecentTurns as jest.Mock;
const listPricing = ServiceLocator.PricingService.public
  .listPricingByProduct as jest.Mock;
const listPackages = ServiceLocator.PackageTemplateService.public
  .listPackageTemplatesByProduct as jest.Mock;
const getCampDetails = ServiceLocator.CampDetailsService.public
  .getCampDetailsByProduct as jest.Mock;
const listSchedules = ServiceLocator.ScheduleService.public
  .listSchedulesByProduct as jest.Mock;
const listSessions = ServiceLocator.SessionService.public
  .listSessionsByProduct as jest.Mock;
const getLocationById = ServiceLocator.LocationService.public
  .getLocationById as jest.Mock;
const getMerchantById = ServiceLocator.MerchantService.public
  .getMerchantById as jest.Mock;

const SCOPE = { merchantId: 42, locationId: 7 };
const DAY = 86_400_000;
const future = (days: number) => new Date(Date.now() + days * DAY);
const past = (days: number) => new Date(Date.now() - days * DAY);

// A federated search response carrying exactly one product — the venue preload
// AND the detail tool's name→product resolution both hit `search`.
function searchWith(product: Record<string, unknown>) {
  const empty = {
    data: [],
    total: 0,
    totalPages: 0,
    page: 1,
    pageSize: 20,
    order: "desc",
  };
  return {
    query: "",
    parsed: {},
    products: {
      ...empty,
      data: [product],
      total: 1,
      totalPages: 1,
    },
    merchants: empty,
  };
}

const CLASS_PRODUCT = {
  id: 1,
  name: "Tots Swim",
  productType: "CLASS",
  ageMin: 3,
  ageMax: 6,
};
const CAMP_PRODUCT = {
  id: 2,
  name: "March Holiday Camp",
  productType: "CAMP",
  ageMin: 5,
  ageMax: 10,
};

// Stream script: a single final reply, no tool call (the model answers straight
// from the preloaded venue context).
function scriptReplyOnly(reply: string) {
  streamMock.mockImplementationOnce(() =>
    (async function* () {
      yield {
        type: "final",
        message: { role: "assistant", content: reply },
        finishReason: "stop",
        usage: {},
      };
    })(),
  );
}

function emptySearch() {
  const empty = { data: [], total: 0, totalPages: 1, page: 1, pageSize: 40, order: "desc" };
  return { query: "", parsed: {}, products: empty, merchants: empty };
}

// Stream script: step 1 → the model calls a tool; step 2 → final reply.
function scriptToolThenReply(
  toolName: string,
  toolArgs: object,
  reply: string,
) {
  streamMock
    .mockImplementationOnce(() =>
      (async function* () {
        yield {
          type: "final",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "t1",
                type: "function",
                function: { name: toolName, arguments: JSON.stringify(toolArgs) },
              },
            ],
          },
          finishReason: "tool_calls",
          usage: {},
        };
      })(),
    )
    .mockImplementationOnce(() =>
      (async function* () {
        yield {
          type: "final",
          message: { role: "assistant", content: reply },
          finishReason: "stop",
          usage: {},
        };
      })(),
    );
}

// Pull the JSON the tool fed back to the model out of the (spotlight-wrapped)
// tool message — the same shape the model would reason over.
function toolResult(): Record<string, any> | null {
  const messages = streamMock.mock.calls[0]?.[0] as { role: string; content: string }[];
  const toolMsg = [...messages].reverse().find((m) => m.role === "tool");
  if (!toolMsg) return null;
  const json = String(toolMsg.content).match(/\{[\s\S]*\}/);
  return json ? JSON.parse(json[0]) : null;
}

const venueChat = (userMessage: string, conversationId = 1) =>
  runConciergeTurn({
    conversationId,
    publicId: `pub-${conversationId}`,
    model: "test-model",
    userMessage,
    scope: SCOPE,
  });

beforeEach(() => {
  jest.clearAllMocks();
  _resetVenueContextCache();
  _resetSearchCache();
  // Default: the venue has one CLASS, no pricing / packages / schedule / sessions.
  search.mockResolvedValue(searchWith(CLASS_PRODUCT));
  getRecentTurns.mockResolvedValue([]);
  listPricing.mockResolvedValue([]);
  listPackages.mockResolvedValue([]);
  getCampDetails.mockResolvedValue(null);
  listSchedules.mockResolvedValue([]);
  listSessions.mockResolvedValue([]);
});

describe("merchant-location concierge — get_activity_details (parent question series)", () => {
  // The "series of questions in one place": each is a real parent ask that must
  // route to the detail tool, hydrate the right slice, and come back grounded.
  it.each([
    ["how much is Tots Swim?", "Tots Swim"],
    ["when does Tots Swim run and what time?", "Tots Swim"],
    ["how many spots are left in Tots Swim?", "Tots Swim"],
    ["do you have any packages or memberships for Tots Swim?", "Tots Swim"],
    ["what does a week of the March Holiday Camp cost?", "March Holiday Camp"],
  ])("answers %j by calling get_activity_details", async (question, activity) => {
    const isCamp = activity === CAMP_PRODUCT.name;
    search.mockResolvedValue(searchWith(isCamp ? CAMP_PRODUCT : CLASS_PRODUCT));
    listPricing.mockResolvedValue([
      { name: "Term", price: 320, priceType: "TERM", isPublic: true },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity },
      `Here are the details for ${activity}. SUGGESTIONS: a | b`,
    );

    await venueChat(question);

    // Resolution went through the scope-pinned search (no ids handled by the model).
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: activity,
        merchantId: 42,
        locationId: 7,
        sections: ["products"],
      }),
    );
    const res = toolResult();
    expect(res).toMatchObject({ found: true, activity: { name: activity } });
  });

  it("pulls PUBLIC pricing only (passes onlyPublic) and surfaces an active promo", async () => {
    listPricing.mockResolvedValue([
      {
        name: "Term",
        price: 320,
        priceType: "TERM",
        sessionsIncluded: 10,
        promoPrice: 280,
        promoCode: "EARLY",
        promoEndDate: future(20),
        earlyBirdDiscount: 30,
        earlyBirdDeadline: past(5), // expired → must be dropped
      },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "It's $320/term, or $280 with code EARLY. SUGGESTIONS: a | b",
    );

    await venueChat("how much is Tots Swim?");

    expect(listPricing).toHaveBeenCalledWith(1, { onlyPublic: true });
    const res = toolResult();
    expect(res?.pricing).toHaveLength(1);
    expect(res?.pricing[0]).toMatchObject({ price: 320, promoPrice: 280, promoCode: "EARLY" });
    // The expired early-bird is not advertised.
    expect(res?.pricing[0].earlyBirdDiscount).toBeUndefined();
  });

  it("lists only available, upcoming, non-archived camp weeks (gating)", async () => {
    search.mockResolvedValue(searchWith(CAMP_PRODUCT));
    getCampDetails.mockResolvedValue({
      options: [
        { name: "Week 1", isAvailable: true, isArchived: false, startDate: future(20), endDate: future(24), startTime: "09:00", endTime: "12:00", price: 400 },
        { name: "Archived Week", isAvailable: true, isArchived: true, startDate: future(20), endDate: future(24), startTime: "09:00", endTime: "12:00", price: 400 },
        { name: "Sold-out Week", isAvailable: false, isArchived: false, startDate: future(20), endDate: future(24), startTime: "09:00", endTime: "12:00", price: 400 },
        { name: "Past Week", isAvailable: true, isArchived: false, startDate: past(10), endDate: past(6), startTime: "09:00", endTime: "12:00", price: 400 },
      ],
    });
    scriptToolThenReply(
      "get_activity_details",
      { activity: "March Holiday Camp" },
      "Week 1 runs in March. SUGGESTIONS: a | b",
    );

    await venueChat("what weeks does the March Holiday Camp run?");

    const res = toolResult();
    const names = (res?.campOptions ?? []).map((o: any) => o.name);
    expect(names).toEqual(["Week 1"]);
  });

  it("keeps published ACTIVE + FULL class schedules, drops draft/cancelled", async () => {
    listSchedules.mockResolvedValue([
      { scheduleType: "RECURRING", dayOfWeek: 2, startTime: "16:00", endTime: "17:00", status: "ACTIVE", isPublished: true },
      { scheduleType: "RECURRING", dayOfWeek: 4, startTime: "16:00", endTime: "17:00", status: "FULL", isPublished: true },
      { scheduleType: "RECURRING", dayOfWeek: 1, startTime: "16:00", endTime: "17:00", status: "DRAFT", isPublished: true },
      { scheduleType: "RECURRING", dayOfWeek: 5, startTime: "16:00", endTime: "17:00", status: "CANCELLED", isPublished: true },
      { scheduleType: "RECURRING", dayOfWeek: 3, startTime: "16:00", endTime: "17:00", status: "ACTIVE", isPublished: false },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "Tuesdays and Thursdays at 4pm. SUGGESTIONS: a | b",
    );

    await venueChat("when is Tots Swim?");

    const res = toolResult();
    const days = (res?.schedule ?? []).map((s: any) => s.day);
    expect(days).toEqual(["Tue", "Thu"]); // ACTIVE + FULL, both published
    expect(res?.schedule.find((s: any) => s.day === "Thu")).toMatchObject({ full: true });
  });

  it("surfaces FULL upcoming sessions with spotsLeft, hides cancelled/completed", async () => {
    listSessions.mockResolvedValue([
      { sessionDate: future(3), startTime: "16:00", endTime: "17:00", availableSlots: 4, status: "SCHEDULED", isCancelled: false },
      { sessionDate: future(5), startTime: "16:00", endTime: "17:00", availableSlots: 0, status: "FULL", isCancelled: false },
      { sessionDate: future(7), startTime: "16:00", endTime: "17:00", availableSlots: 2, status: "CANCELLED", isCancelled: true },
      { sessionDate: future(9), startTime: "16:00", endTime: "17:00", availableSlots: 2, status: "COMPLETED", isCancelled: false },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "Next session has 4 spots. SUGGESTIONS: a | b",
    );

    await venueChat("any spots left in Tots Swim?");

    const res = toolResult();
    expect(res?.upcomingSessions).toHaveLength(2);
    expect(res?.upcomingSessions[1]).toMatchObject({ spotsLeft: 0, full: true });
  });

  it("lists only public, non-archived packages (gating)", async () => {
    listPackages.mockResolvedValue([
      { name: "10-Class Pack", kind: "REGULAR", price: 300, creditsIncluded: 10, isPublic: true, isArchived: false },
      { name: "Archived Pack", kind: "REGULAR", price: 300, isPublic: true, isArchived: true },
      { name: "Hidden Pack", kind: "REGULAR", price: 300, isPublic: false, isArchived: false },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "There's a 10-class pack. SUGGESTIONS: a | b",
    );

    await venueChat("any packages for Tots Swim?");

    const res = toolResult();
    const names = (res?.packages ?? []).map((p: any) => p.name);
    expect(names).toEqual(["10-Class Pack"]);
  });

  it("flags closestMatch when the asked-for name isn't actually offered (anti-misgrounding)", async () => {
    // Venue only has "Tots Swim"; parent asks about "yoga" → top hit fallback.
    listPricing.mockResolvedValue([
      { name: "Term", price: 320, priceType: "TERM" },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "yoga" },
      "We don't run yoga — did you mean Tots Swim? SUGGESTIONS: a | b",
    );

    await venueChat("how much is yoga?");

    const res = toolResult();
    expect(res).toMatchObject({ found: true, closestMatch: true });
    expect(res?.activity.name).toBe("Tots Swim"); // the real resolved name, surfaced for confirmation
  });

  it("does NOT flag closestMatch on a real name match", async () => {
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "Here it is. SUGGESTIONS: a | b",
    );

    await venueChat("tell me about Tots Swim");

    const res = toolResult();
    expect(res?.found).toBe(true);
    expect(res?.closestMatch).toBeUndefined();
  });

  it("says nothing is priced (note) rather than inventing one when no public data exists", async () => {
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "Pricing isn't listed yet. SUGGESTIONS: a | b",
    );

    await venueChat("how much is Tots Swim?");

    const res = toolResult();
    expect(res?.found).toBe(true);
    expect(res?.pricing).toBeUndefined();
    expect(res?.note).toMatch(/No public pricing/i);
  });
});

describe("merchant-location concierge — history awareness & search", () => {
  it("replays prior conversation turns into the model context (history awareness)", async () => {
    getRecentTurns.mockResolvedValue([
      { role: AI_TURN_ROLE.USER, content: "do you have swimming?" },
      { role: AI_TURN_ROLE.ASSISTANT, content: "Yes — we run Tots Swim for ages 3–6." },
    ]);
    scriptToolThenReply(
      "get_activity_details",
      { activity: "Tots Swim" },
      "It's $320/term. SUGGESTIONS: a | b",
    );

    // A follow-up that only makes sense WITH the prior turns ("it" = Tots Swim).
    await venueChat("how much is it?");

    const messages = streamMock.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    // The two prior turns sit between the system prompt and the new user message.
    expect(messages[1]).toMatchObject({ role: "user", content: "do you have swimming?" });
    expect(messages[2]).toMatchObject({ role: "assistant" });
    expect(messages[2].content).toContain("Tots Swim");
    expect(messages[3]).toMatchObject({ role: "user", content: "how much is it?" });
  });

  it("offers BOTH tools in a venue chat (search + detail)", async () => {
    scriptToolThenReply("search_activities", { query: "swim" }, "Here you go. SUGGESTIONS: a | b");
    await venueChat("what do you offer");

    const toolNames = (streamMock.mock.calls[0][1] as { function: { name: string } }[]).map(
      (t) => t.function.name,
    );
    expect(toolNames).toEqual(
      expect.arrayContaining(["search_activities", "get_activity_details"]),
    );
  });

  it("does a simple scoped search (products-only, venue-pinned)", async () => {
    scriptToolThenReply("search_activities", { query: "swim" }, "We have Tots Swim. SUGGESTIONS: a | b");

    const res = await venueChat("show me swimming");

    // Every search is hard-pinned to this venue and products-only.
    for (const call of search.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({ merchantId: 42, locationId: 7, sections: ["products"] }),
      );
    }
    expect(res.reply).toContain("Tots Swim");
  });
});

describe("Google rating surfacing (gMapRating / reviewCount)", () => {
  it("puts the venue's Google rating into the merchant-location ABOUT block", async () => {
    (ServiceLocator.LocationService.public.getLocationById as jest.Mock).mockResolvedValue({
      name: "Swim Masters Tampines",
      sgDistrict: "Tampines",
      locationType: "INDOOR",
      gMapRating: 4.7,
      reviewCount: 123,
      details: { description: "Learn-to-swim specialists." },
    });
    scriptToolThenReply("search_activities", { query: "swim" }, "We're well rated. SUGGESTIONS: a | b");

    await venueChat("is this place any good?");

    const systemPrompt = streamMock.mock.calls[0][0][0].content as string;
    expect(systemPrompt).toContain("4.7");
    expect(systemPrompt).toContain("123");
  });

  it("projects the venue rating under a name the model cannot misattribute", async () => {
    search.mockResolvedValue({
      query: "swim",
      parsed: {},
      products: {
        data: [
          {
            id: 1,
            name: "Tots Swim",
            productType: "CLASS",
            ageMin: 3,
            ageMax: 6,
            location: { sgDistrict: "Tampines", gMapRating: 4.8, reviewCount: 90 },
            merchant: { name: "Swim Masters" },
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
        pageSize: 20,
        order: "desc",
      },
      merchants: { data: [], total: 0, totalPages: 1, page: 1, pageSize: 20, order: "desc" },
    });
    scriptToolThenReply("search_activities", { query: "swim" }, "Found some. SUGGESTIONS: a | b");

    // No scope → global discovery (the search projection, not the store shape).
    await runConciergeTurn({
      conversationId: 70,
      publicId: "pub-70",
      model: "test-model",
      userMessage: "well-rated swim classes",
    });

    const res = toolResult();
    expect(res?.products[0]).toMatchObject({ venueRating: 4.8, venueReviews: 90 });
    // The old names sat beside the activity's own name and ages, and the model read
    // them as the activity's rating. There is no rating on Product at all.
    expect(res?.products[0]).not.toHaveProperty("rating");
    expect(res?.products[0]).not.toHaveProperty("reviews");
  });
});

describe("venue context — tells the parent about the place even with NO products", () => {
  it("renders the full venue profile (age/where/hours/contact/verified) and never dead-ends", async () => {
    search.mockResolvedValue(emptySearch()); // no published activities at all
    getMerchantById.mockResolvedValue({
      name: "Impressions Kids Club",
      isVerified: true,
      contactPhone: "+65 9363 4444",
      webUrl: "https://impressionskidsclub.com",
    });
    getLocationById.mockResolvedValue({
      name: "Meyer Road",
      address: "128 Meyer Road, Singapore",
      sgDistrict: "District 15",
      sgRegion: "CENTRAL",
      locationType: "INDOOR",
      ageMin: 2,
      ageMax: 6,
      gMapRating: 4.3,
      reviewCount: 22,
      operatingHrs: [
        { day: 1, businessHrs: "Closed - Closed" },
        { day: 2, businessHrs: "8:00 am - 5:00 pm" },
        { day: 3, businessHrs: "8:00 am - 5:00 pm" },
        { day: 4, businessHrs: "8:00 am - 5:00 pm" },
        { day: 5, businessHrs: "8:00 am - 5:00 pm" },
        { day: 6, businessHrs: "8:00 am - 5:00 pm" },
        { day: 7, businessHrs: "8:00 am - 5:00 pm" },
      ],
      details: {
        phone: "+65 9123 4567",
        whatsApp: "+65 9123 4567",
        bookingUrl: "https://book.example",
        description: "A warm indoor play club.",
      },
    });
    scriptReplyOnly(
      "Impressions Kids Club is a lovely indoor club for ages 2–6 in District 15. SUGGESTIONS: a | b",
    );

    await venueChat("what does this offer for 5 year olds?");

    const sys = streamMock.mock.calls[0][0][0].content as string;
    // The venue facts the concierge can now actually tell a parent about.
    expect(sys).toContain("a verified provider");
    expect(sys).toContain("children aged 2–6");
    expect(sys).toContain("128 Meyer Road");
    expect(sys).toContain("District 15");
    expect(sys).toContain("4.3★");
    expect(sys).toContain("Opening hours:");
    expect(sys).toContain("Mon Closed");
    expect(sys).toContain("Tue–Sun 8:00 am - 5:00 pm"); // consecutive days collapsed
    expect(sys).toContain("+65 9123 4567"); // contact (details fallback)
    expect(sys).toContain("Book online: https://book.example");
    // Empty catalogue is stated factually, NOT as a dead-end.
    expect(sys).toContain("Activities listed online: none yet");
    expect(sys).not.toContain("No published activities are listed");
  });
});

describe("global discovery concierge — detail tool withheld", () => {
  it("forwards multi category + region chips to the search", async () => {
    scriptToolThenReply(
      "search_activities",
      { query: "swim", category: ["Swim", "Dance"], region: ["Central", "East"] },
      "Found some. SUGGESTIONS: a | b",
    );

    await runConciergeTurn({
      conversationId: 71,
      publicId: "pub-71",
      model: "test-model",
      userMessage: "swim or dance in central or east",
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ["Swim", "Dance"],
        region: ["Central", "East"],
      }),
    );
  });

  it("tells the model about pinned chips (ACTIVE FILTERS) so it searches, not asks", async () => {
    scriptReplyOnly("Here are some options. SUGGESTIONS: a | b");

    await runConciergeTurn({
      conversationId: 73,
      publicId: "pub-73",
      model: "test-model",
      userMessage: "activities for my 8 year old", // vague: no activity term
      category: ["Swim", "Dance"],
      region: ["Central", "East"],
    });

    const sys = streamMock.mock.calls[0][0][0].content as string;
    expect(sys).toContain("ACTIVE FILTERS");
    expect(sys).toContain("Swim, Dance");
    expect(sys).toContain("Central, East");
  });

  it("does not announce an 'Anywhere'-only region as an active filter", async () => {
    scriptReplyOnly("Sure. SUGGESTIONS: a | b");

    await runConciergeTurn({
      conversationId: 74,
      publicId: "pub-74",
      model: "test-model",
      userMessage: "swimming",
      region: "Anywhere",
    });

    const sys = streamMock.mock.calls[0][0][0].content as string;
    expect(sys).not.toContain("ACTIVE FILTERS");
  });

  it("pins FE category/region chips into the search, overriding the model", async () => {
    // The model infers different chips from the message; the pinned FE chips win.
    scriptToolThenReply(
      "search_activities",
      { query: "swim", category: ["Coding"], region: ["West"] },
      "Found some. SUGGESTIONS: a | b",
    );

    await runConciergeTurn({
      conversationId: 72,
      publicId: "pub-72",
      model: "test-model",
      userMessage: "swim",
      category: ["Swim", "Dance"], // FE-selected chips
      region: ["Central", "East"],
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ["Swim", "Dance"],
        region: ["Central", "East"],
      }),
    );
  });

  it("does NOT offer get_activity_details when there is no venue scope", async () => {
    scriptToolThenReply("search_activities", { query: "swim" }, "Found some. SUGGESTIONS: a | b");

    await runConciergeTurn({
      conversationId: 99,
      publicId: "pub-99",
      model: "test-model",
      userMessage: "swimming near tampines",
    });

    const toolNames = (streamMock.mock.calls[0][1] as { function: { name: string } }[]).map(
      (t) => t.function.name,
    );
    expect(toolNames).toEqual(["search_activities"]);
  });
});
