const search = jest.fn();

jest.mock("../../../src/lib/searchClient", () => ({
  __esModule: true,
  searchClient: { search: (...args: unknown[]) => search(...args) },
}));

import {
  searchActivitiesTool,
  _resetSearchCache,
} from "../../../src/ai/assistants/concierge/tools/search";
import type { ConciergeToolContext } from "../../../src/ai/assistants/concierge/tools/types";

const response = () => ({
  query: "",
  parsed: {},
  products: {
    data: [],
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 20,
    order: "desc",
  },
  merchants: { data: [], total: 0, totalPages: 1, page: 1, pageSize: 20, order: "desc" },
});

const ctx = (over: Partial<ConciergeToolContext> = {}): ConciergeToolContext =>
  ({ userMessage: "", scoped: false, ...over }) as ConciergeToolContext;

/**
 * The cheap path (the featured browse shown before a parent has said anything) was
 * cached while the real search was not, so every repeat of a popular query paid a
 * full round-trip and a page of hydration.
 */
describe("search_activities response cache", () => {
  beforeEach(() => {
    _resetSearchCache();
    search.mockReset();
    search.mockResolvedValue(response());
  });

  it("runs the search once for a repeated identical ask", async () => {
    await searchActivitiesTool.run({ query: "swimming" }, ctx());
    await searchActivitiesTool.run({ query: "swimming" }, ctx());
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("runs it again when the parent changes anything", async () => {
    await searchActivitiesTool.run({ query: "swimming" }, ctx());
    await searchActivitiesTool.run({ query: "swimming", age: 5 }, ctx());
    expect(search).toHaveBeenCalledTimes(2);
  });

  /**
   * The key is built AFTER server-side grounding, so the pinned scope is part of it.
   * Sharing an entry across venues would show one provider another's catalogue —
   * the confinement boundary the venue chat depends on.
   */
  it("never shares an entry between two venues", async () => {
    const at = (merchantId: number) =>
      ctx({ scoped: true, scope: { merchantId, locationId: merchantId } as never });

    await searchActivitiesTool.run({ query: "swimming" }, at(1));
    await searchActivitiesTool.run({ query: "swimming" }, at(2));
    expect(search).toHaveBeenCalledTimes(2);
  });

  /** A failure must not become the answer every parent gets for the next minute. */
  it("does not cache a failure — the next ask retries", async () => {
    search.mockRejectedValueOnce(new Error("search engine down"));
    await expect(
      searchActivitiesTool.run({ query: "swimming" }, ctx()),
    ).rejects.toThrow();

    search.mockResolvedValue(response());
    await searchActivitiesTool.run({ query: "swimming" }, ctx());
    expect(search).toHaveBeenCalledTimes(2);
  });
});
