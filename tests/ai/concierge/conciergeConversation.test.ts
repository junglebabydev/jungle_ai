// No DB needed — prisma is mocked.
jest.mock("../../../src/config/prisma", () => ({
  __esModule: true,
  default: {
    conciergeConversation: { create: jest.fn(), findUnique: jest.fn() },
    conciergeTurn: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
  },
}));

import prisma from "../../../src/config/prisma";
import { ConciergeConversationServiceInternal } from "../../../src/services/concierge-conversation/service.internal";
import { NotFoundError } from "../../../src/errors/domains/NotFoundError";

const db = prisma as unknown as {
  conciergeConversation: { create: jest.Mock; findUnique: jest.Mock };
  conciergeTurn: { count: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe("ConciergeConversationServiceInternal", () => {
  it("createConversation records the model", async () => {
    db.conciergeConversation.create.mockResolvedValue({ id: 1, model: "m" });
    const row = await ConciergeConversationServiceInternal.createConversation("m");
    expect(db.conciergeConversation.create).toHaveBeenCalledWith({
      data: { model: "m" },
    });
    expect(row).toEqual({ id: 1, model: "m" });
  });

  it("getConversationByPublicId returns a live conversation", async () => {
    db.conciergeConversation.findUnique.mockResolvedValue({
      id: 1,
      conciergeConversationID: "uuid",
      isArchived: false,
    });
    const row =
      await ConciergeConversationServiceInternal.getConversationByPublicId("uuid");
    expect(db.conciergeConversation.findUnique).toHaveBeenCalledWith({
      where: { conciergeConversationID: "uuid" },
    });
    expect(row.id).toBe(1);
  });

  it("throws NotFound when the public id is unknown", async () => {
    db.conciergeConversation.findUnique.mockResolvedValue(null);
    await expect(
      ConciergeConversationServiceInternal.getConversationByPublicId("nope"),
    ).rejects.toBe(NotFoundError.ConciergeConversation);
  });

  it("throws NotFound when the conversation is archived", async () => {
    db.conciergeConversation.findUnique.mockResolvedValue({
      id: 1,
      isArchived: true,
    });
    await expect(
      ConciergeConversationServiceInternal.getConversationByPublicId("uuid"),
    ).rejects.toBe(NotFoundError.ConciergeConversation);
  });

  it("appendTurns assigns contiguous sequence numbers after the existing count", async () => {
    db.conciergeTurn.count.mockResolvedValue(2);
    db.conciergeTurn.createMany.mockResolvedValue({ count: 2 });
    const total = await ConciergeConversationServiceInternal.appendTurns(7, [
      { role: "USER", content: "hi" },
      { role: "ASSISTANT", content: "hello" },
    ] as never);
    expect(db.conciergeTurn.createMany).toHaveBeenCalledWith({
      data: [
        { conversationId: 7, sequence: 2, role: "USER", content: "hi" },
        { conversationId: 7, sequence: 3, role: "ASSISTANT", content: "hello" },
      ],
    });
    expect(total).toBe(4);
  });

  it("getRecentTurns returns oldest→newest (reverses the desc query)", async () => {
    db.conciergeTurn.findMany.mockResolvedValue([
      { sequence: 3 },
      { sequence: 2 },
      { sequence: 1 },
    ]);
    const rows = await ConciergeConversationServiceInternal.getRecentTurns(7, 20);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });
});
