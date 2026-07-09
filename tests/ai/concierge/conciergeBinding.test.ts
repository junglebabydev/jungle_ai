// The concierge loop with the LLM + service layer mocked, so we can assert the
// production-critical invariant: the section binding (the active FE tab) is pinned
// into EVERY search server-side — the model never controls it.

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
    // merchant-location chat preloads the provider profile + location for the prompt.
    MerchantService: {
      public: { getMerchantById: jest.fn().mockResolvedValue({ name: "Swim Masters" }) },
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
    },
    // buildVenueContext also preloads the location's activity categories.
    ProductCategoryService: {
      public: { listProductCategorie: jest.fn().mockResolvedValue([]) },
    },
  },
}));

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

const streamMock = streamChatCompletion as jest.Mock;
const search = searchClient.search as jest.Mock;

function fakeSearchResponse() {
  const empty = { data: [], total: 0, totalPages: 0, page: 1, pageSize: 8, order: "desc" };
  return {
    query: "swim",
    parsed: {},
    products: empty,
    merchants: { ...empty, data: [{ name: "Swim Masters" }], total: 1, totalPages: 1 },
  };
}

// Assert that EVERY structured search call carries the pinned section — the model
// can never widen past the active tab (it's passed in the single options object,
// server-side, regardless of what the model put in the tool args).
function expectEverySearchBoundTo(
  search: jest.Mock,
  sections: string[] | undefined,
) {
  expect(search).toHaveBeenCalled();
  for (const call of search.mock.calls) {
    expect(call[0]).toEqual(expect.objectContaining({ sections }));
  }
}

// Stream behavior: step 1 → the model calls search_activities; step 2 → final reply.
function scriptToolThenReply(toolArgs: object, reply: string) {
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
                function: { name: "search_activities", arguments: JSON.stringify(toolArgs) },
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

beforeEach(() => {
  jest.clearAllMocks();
  // The venue preload is cached per (merchant,location); clear it so a case's
  // search-mock changes aren't masked by a prior case's cached context.
  _resetVenueContextCache();
  search.mockResolvedValue(fakeSearchResponse());
});

describe("runConciergeTurn — section binding", () => {
  it("pins the request sections into the search (model cannot change them)", async () => {
    scriptToolThenReply({ query: "swim" }, "Here are some providers. SUGGESTIONS: a | b");

    const res = await runConciergeTurn({
      conversationId: 1,
      publicId: "pub-uuid",
      model: "test-model",
      userMessage: "show me swimming camps", // asks for camps...
      sections: ["merchants"], //              ...but bound to the Activities tab
    });

    // Every search ran with the PINNED section, not whatever the model intended.
    expectEverySearchBoundTo(search, ["merchants"]);
    // The model owns the query via the structured tool; its activity term flows
    // through to search.
    expect(search.mock.calls[0][0].query).toBe("swim");
    // Full federated results passed back to the FE (global discovery → merchants
    // section present); reply is the (redacted) model text.
    expect((res.results as Record<string, any>)?.merchants.total).toBe(1);
    expect(res.reply).toContain("providers");
  });

  it("passes sections through unchanged for the Camps tab", async () => {
    scriptToolThenReply({ query: "art" }, "A few options. SUGGESTIONS: x | y");
    await runConciergeTurn({
      conversationId: 2,
      publicId: "pub2",
      model: "test-model",
      userMessage: "art",
      sections: ["products"],
    });
    expectEverySearchBoundTo(search, ["products"]);
    expect(search.mock.calls[0][0].query).toBe("art");
  });

  it("leaves sections undefined (both) when no tab is pinned", async () => {
    scriptToolThenReply({ query: "chess" }, "Found some. SUGGESTIONS: a | b");
    await runConciergeTurn({
      conversationId: 3,
      publicId: "pub3",
      model: "test-model",
      userMessage: "chess",
    });
    expectEverySearchBoundTo(search, undefined);
    expect(search.mock.calls[0][0].query).toBe("chess");
  });

  it("keeps main cards when the tool adds an automatic Explorer Map complement", async () => {
    const main = fakeSearchResponse();
    const supporting = {
      ...fakeSearchResponse(),
      query: "",
      parsed: { trail: ["Cognitive"] },
      products: {
        ...fakeSearchResponse().products,
        total: 2,
      },
    };
    search.mockResolvedValueOnce(main).mockResolvedValueOnce(supporting);
    scriptToolThenReply(
      { query: "swim", age: 6, category: "Swim" },
      "Swimming is the anchor. Discovery can add new ground. SUGGESTIONS: swimming | discovery",
    );

    const response = await runConciergeTurn({
      conversationId: 4,
      publicId: "pub4",
      model: "test-model",
      userMessage: "swimming activities for my 6 year old",
      sections: ["products"],
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1][0]).toEqual(
      expect.objectContaining({ query: "", age: 6, trail: "Cognitive" }),
    );
    expect(response.results).toBe(main);
  });

  it("gives explicit parent trail language precedence over wrong model arguments", async () => {
    scriptToolThenReply(
      { query: "", trail: ["Cognitive", "Creative"] },
      "Here are group options. SUGGESTIONS: teamwork | social confidence",
    );

    await runConciergeTurn({
      conversationId: 5,
      publicId: "pub5",
      model: "test-model",
      userMessage: "Something that builds confidence with other kids",
      sections: ["products"],
    });

    expect(search.mock.calls[0][0].trail).toEqual(["Social"]);
  });
});

describe("runConciergeTurn — merchant-location scope (venue chat)", () => {
  it("pins merchantId/locationId into EVERY search and forces products-only", async () => {
    scriptToolThenReply({ query: "swim" }, "Here at the centre. SUGGESTIONS: a | b");

    await runConciergeTurn({
      conversationId: 9,
      publicId: "pub9",
      model: "test-model",
      userMessage: "what can my kid do here",
      // even if the model tried to widen, the server-pinned scope wins
      scope: { merchantId: 42, locationId: 7 },
    });

    expect(search).toHaveBeenCalled();
    for (const call of search.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          merchantId: 42,
          locationId: 7,
          // a merchant-location chat is products-only — never the global directory
          sections: ["products"],
        }),
      );
    }
  });

  it("wraps the merchant-authored ABOUT block in untrusted-data markers (anti-injection)", async () => {
    scriptToolThenReply({ query: "swim" }, "Here at the centre. SUGGESTIONS: a | b");

    await runConciergeTurn({
      conversationId: 10,
      publicId: "pub10",
      model: "test-model",
      userMessage: "what do you offer",
      scope: { merchantId: 42, locationId: 7 },
    });

    // The preloaded provider profile (merchant/location descriptions + product
    // names) is provider-authored free text injected into the system prompt — it
    // MUST be spotlighted as untrusted so a product description can't smuggle
    // instructions into the prompt.
    const systemMessage = streamMock.mock.calls[0][0][0];
    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain("UNTRUSTED_TOOL_DATA");
  });

  it("returns the lean 'independent store' shape — identity once, no merchants block, no per-product nesting", async () => {
    // One product carrying the (repeated) merchant + location nesting we expect to strip.
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
            ageMax: 5,
            merchant: { id: 42, name: "Swim Masters" },
            location: { id: 7, name: "Tampines branch" },
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
    scriptToolThenReply({ query: "swim" }, "We have Tots Swim. SUGGESTIONS: a | b");

    const res = await runConciergeTurn({
      conversationId: 11,
      publicId: "pub11",
      model: "test-model",
      userMessage: "what do you offer",
      scope: { merchantId: 42, locationId: 7 },
    });

    const results = res.results as Record<string, any>;
    // Store identity stated ONCE — preferring the richer preloaded venue lookups.
    expect(results.store.merchant?.name).toBe("Swim Masters");
    expect(results.store.location?.name).toBe("Swim Masters Tampines");
    // No global merchants section in a single-store response.
    expect(results.merchants).toBeUndefined();
    // Products carry NO repeated per-product merchant/location.
    expect(results.products.data[0].name).toBe("Tots Swim");
    expect(results.products.data[0].merchant).toBeUndefined();
    expect(results.products.data[0].location).toBeUndefined();
  });

  it("caches the venue preload across turns (no repeat merchant/location lookups)", async () => {
    const getMerchant = ServiceLocator.MerchantService.public
      .getMerchantById as jest.Mock;
    const getLocation = ServiceLocator.LocationService.public
      .getLocationById as jest.Mock;
    const scope = { merchantId: 42, locationId: 7 };

    scriptToolThenReply({ query: "swim" }, "Turn one. SUGGESTIONS: a | b");
    await runConciergeTurn({
      conversationId: 12,
      publicId: "pub12",
      model: "test-model",
      userMessage: "what's here",
      scope,
    });

    scriptToolThenReply({ query: "swim" }, "Turn two. SUGGESTIONS: a | b");
    await runConciergeTurn({
      conversationId: 12,
      publicId: "pub12",
      model: "test-model",
      userMessage: "anything for a 6 year old?",
      scope,
    });

    // Built ONCE on the first turn and served from cache on the second — the
    // preload's merchant/location lookups don't run again.
    expect(getMerchant).toHaveBeenCalledTimes(1);
    expect(getLocation).toHaveBeenCalledTimes(1);
  });
});
