// File-scoped ServiceLocator mock (overrides the global setup mock for this
// file) — the dispatcher's ownership re-check reads these internal lookups.
jest.mock("../../../src/services", () => ({
  ServiceLocator: {
    ProductService: { internal: { findProductById: jest.fn() } },
    PackageTemplateService: { internal: { getPackageTemplateById: jest.fn() } },
  },
}));

import { ServiceLocator } from "../../../src/services";
import { dispatchTool } from "../../../src/ai/assistants/merchant/dispatch";
import { defineTool, MerchantScope } from "../../../src/ai/assistants/merchant/tools/types";
import { id } from "../../../src/ai/assistants/merchant/tools/common";
import { PERMISSIONS_MAP } from "../../../src/shared/constants";

const scope: MerchantScope = { merchantId: 10, locationId: 20, userId: 30 };
const PERM = PERMISSIONS_MAP.PRODUCT_UPDATE.code;
const withPerm = new Set([PERM]);

const findProduct = ServiceLocator.ProductService.internal.findProductById as jest.Mock;
const getPackage = ServiceLocator.PackageTemplateService.internal.getPackageTemplateById as jest.Mock;

let handlerCalls = 0;
const productTool = defineTool({
  name: "fake_product",
  description: "t",
  input: { productId: id },
  requiredPermissions: [PERM],
  sensitive: false,
  handler: async () => {
    handlerCalls++;
    return { done: true };
  },
});
const packageTool = defineTool({
  name: "fake_package",
  description: "t",
  input: { packageTemplateId: id },
  requiredPermissions: [PERM],
  sensitive: false,
  handler: async () => {
    handlerCalls++;
    return { done: true };
  },
});

describe("agent/dispatch: validation → ownership → RBAC → handler", () => {
  beforeEach(() => {
    handlerCalls = 0;
    jest.clearAllMocks();
    findProduct.mockResolvedValue({ id: 1, locationId: scope.locationId }); // owned
    getPackage.mockResolvedValue({ id: 1, merchantId: scope.merchantId }); // owned
  });

  it("rejects invalid args with BR_023 (and never runs the handler)", async () => {
    const r = await dispatchTool(productTool as never, {}, scope, withPerm);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BR_023");
    expect(handlerCalls).toBe(0);
  });

  it("denies a product from another location with ATH_005", async () => {
    findProduct.mockResolvedValue({ id: 1, locationId: 999 });
    const r = await dispatchTool(productTool as never, { productId: 1 }, scope, withPerm);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ATH_005");
    expect(handlerCalls).toBe(0);
  });

  it("denies a missing product with a NotFound code", async () => {
    findProduct.mockResolvedValue(null);
    const r = await dispatchTool(productTool as never, { productId: 1 }, scope, withPerm);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toMatch(/^NF_/);
  });

  it("denies a package from another merchant with ATH_005", async () => {
    getPackage.mockResolvedValue({ id: 1, merchantId: 999 });
    const r = await dispatchTool(packageTool as never, { packageTemplateId: 1 }, scope, withPerm);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ATH_005");
  });

  it("denies when the required permission is missing (ATH_005)", async () => {
    const r = await dispatchTool(productTool as never, { productId: 1 }, scope, new Set());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ATH_005");
    expect(handlerCalls).toBe(0);
  });

  it("runs the handler when owned + permitted", async () => {
    const r = await dispatchTool(productTool as never, { productId: 1 }, scope, withPerm);
    expect(r.ok).toBe(true);
    expect(handlerCalls).toBe(1);
  });
});
