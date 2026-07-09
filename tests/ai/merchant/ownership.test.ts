// The in-process cross-tenant backstop. assertResourceOwnership runs before a
// sensitive tool is parked; it must re-check a model-supplied id against the
// pinned scope. Ids arrive as RAW tool-call JSON, so the model can send them as
// STRINGS — a `typeof === "number"` check would SKIP the re-check on a string id
// and let a foreign id through. These tests prove string ids are coerced + checked.
jest.mock("../../../src/services", () => ({
  ServiceLocator: {
    ProductService: { internal: { findProductById: jest.fn() } },
    PackageTemplateService: { internal: { getPackageTemplateById: jest.fn() } },
  },
}));

import { ServiceLocator } from "../../../src/services";
import { assertResourceOwnership } from "../../../src/ai/assistants/merchant/ownership";
import { MerchantScope } from "../../../src/ai/assistants/merchant/tools/types";

const findProductById = ServiceLocator.ProductService.internal
  .findProductById as unknown as jest.Mock;
const getPackageTemplateById = ServiceLocator.PackageTemplateService.internal
  .getPackageTemplateById as unknown as jest.Mock;

const scope: MerchantScope = { merchantId: 10, locationId: 20, userId: 30 };

describe("assertResourceOwnership: string ids are coerced, not skipped", () => {
  beforeEach(() => jest.clearAllMocks());

  it("validates a STRING productId and blocks one in another location", async () => {
    findProductById.mockResolvedValue({ id: 63, locationId: 999 }); // not the pinned location
    await expect(assertResourceOwnership({ productId: "63" }, scope)).rejects.toThrow();
    expect(findProductById).toHaveBeenCalledWith(63); // coerced "63" -> 63, check ran
  });

  it("passes when a string productId belongs to the pinned location", async () => {
    findProductById.mockResolvedValue({ id: 63, locationId: 20 }); // == scope.locationId
    await expect(assertResourceOwnership({ productId: "63" }, scope)).resolves.toBeUndefined();
  });

  it("blocks a foreign package via a STRING packageTemplateId", async () => {
    getPackageTemplateById.mockResolvedValue({ id: 5, merchantId: 999 });
    await expect(assertResourceOwnership({ packageTemplateId: "5" }, scope)).rejects.toThrow();
    expect(getPackageTemplateById).toHaveBeenCalledWith(5);
  });

  it("no id present (e.g. a schedule-cancel with only data) → nothing to check", async () => {
    await expect(
      assertResourceOwnership({ scheduleId: "9", data: { status: "CANCELLED" } }, scope),
    ).resolves.toBeUndefined();
    expect(findProductById).not.toHaveBeenCalled();
  });
});
