// File-scoped mocks: the gate persists/loads pending actions, re-derives scope
// from the conversation, re-resolves RBAC, then dispatches the real tool.
jest.mock("../../../src/services", () => ({
  ServiceLocator: {
    MerchantChatConversationService: {
      internal: {
        getPendingByNonce: jest.fn(),
        getConversationById: jest.fn(),
        resolvePendingAction: jest.fn(),
        createPendingAction: jest.fn(),
      },
    },
    ProductService: {
      internal: { findProductById: jest.fn() },
      public: { publishProduct: jest.fn() },
    },
  },
}));
jest.mock("../../../src/auth/permission-resolver", () => ({
  resolvePermissions: jest.fn(),
}));

import { AI_PENDING_STATUS } from "@prisma/client";
import { ServiceLocator } from "../../../src/services";
import { resolvePermissions } from "../../../src/auth/permission-resolver";
import { createConfirmation, executeConfirmation } from "../../../src/ai/assistants/merchant/gate";
import { PERMISSIONS_MAP } from "../../../src/shared/constants";

const conv = ServiceLocator.MerchantChatConversationService.internal as unknown as {
  getPendingByNonce: jest.Mock;
  getConversationById: jest.Mock;
  resolvePendingAction: jest.Mock;
  createPendingAction: jest.Mock;
};
const findProduct = ServiceLocator.ProductService.internal.findProductById as jest.Mock;
const publishProduct = ServiceLocator.ProductService.public.publishProduct as jest.Mock;
const resolvePerms = resolvePermissions as jest.Mock;

const CONVERSATION = { id: 7, merchantId: 10, locationId: 20, userId: 30 };

function pending(overrides: Record<string, unknown> = {}) {
  return {
    status: AI_PENDING_STATUS.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    conversationId: 7,
    toolName: "publish_product",
    argsJson: { productId: 1 },
    ...overrides,
  };
}

describe("agent/gate: server-authoritative confirm gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    conv.getConversationById.mockResolvedValue(CONVERSATION);
    conv.resolvePendingAction.mockResolvedValue({});
    findProduct.mockResolvedValue({ id: 1, locationId: CONVERSATION.locationId }); // owned
    resolvePerms.mockResolvedValue(new Set([PERMISSIONS_MAP.PRODUCT_UPDATE.code]));
    publishProduct.mockResolvedValue({ id: 1, isPublished: true });
  });

  it("parks a pending action with a future expiry (createConfirmation)", async () => {
    conv.createPendingAction.mockResolvedValue({ nonce: "abc" });
    const out = await createConfirmation(7, "publish_product", { productId: 1 });
    expect(out.nonce).toBe("abc");
    const arg = conv.createPendingAction.mock.calls[0][0];
    expect(arg.conversationId).toBe(7);
    expect(arg.toolName).toBe("publish_product");
    expect(arg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("executes a confirmed publish (approve) and marks it CONFIRMED", async () => {
    conv.getPendingByNonce.mockResolvedValue(pending());
    const out = await executeConfirmation("n", true);
    expect(out.status).toBe("confirmed");
    expect(publishProduct).toHaveBeenCalledWith(1);
    expect(conv.resolvePendingAction).toHaveBeenCalledWith("n", AI_PENDING_STATUS.CONFIRMED);
  });

  it("does NOT execute on cancel (approve=false) — marks DECLINED", async () => {
    conv.getPendingByNonce.mockResolvedValue(pending());
    const out = await executeConfirmation("n", false);
    expect(out.status).toBe("declined");
    expect(publishProduct).not.toHaveBeenCalled();
    expect(conv.resolvePendingAction).toHaveBeenCalledWith("n", AI_PENDING_STATUS.DECLINED);
  });

  it("rejects an expired confirmation (no execution)", async () => {
    conv.getPendingByNonce.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
    const out = await executeConfirmation("n", true);
    expect(out.status).toBe("expired");
    expect(publishProduct).not.toHaveBeenCalled();
    expect(conv.resolvePendingAction).toHaveBeenCalledWith("n", AI_PENDING_STATUS.EXPIRED);
  });

  it("ignores an already-resolved confirmation (no double-execute)", async () => {
    conv.getPendingByNonce.mockResolvedValue(pending({ status: AI_PENDING_STATUS.CONFIRMED }));
    const out = await executeConfirmation("n", true);
    expect(out.status).toBe("already_resolved");
    expect(publishProduct).not.toHaveBeenCalled();
    expect(conv.resolvePendingAction).not.toHaveBeenCalled();
  });

  it("confirming a foreign product is blocked (cross-tenant safety)", async () => {
    findProduct.mockResolvedValue({ id: 1, locationId: 999 }); // another location
    conv.getPendingByNonce.mockResolvedValue(pending());
    const out = await executeConfirmation("n", true);
    expect(out.status).toBe("confirmed"); // the pending is resolved...
    if (out.status === "confirmed") {
      expect(out.result.ok).toBe(false); // ...but the action itself was denied
      if (out.result.ok === false) expect(out.result.code).toBe("ATH_005");
    }
    expect(publishProduct).not.toHaveBeenCalled();
  });
});
