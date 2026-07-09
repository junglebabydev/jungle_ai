// File-scoped mock: handlers call services via ServiceLocator (DIP). We only
// mock the slices the tested handlers touch; `parseDto` still runs the REAL
// booking_system Zod schemas, so these also prove the nested body shape is valid.
jest.mock("../../../src/services", () => ({
  ServiceLocator: {
    ClassDetailsService: { public: { createClass: jest.fn(async () => ({ id: 1 })) } },
    BirthdayDetailsService: { public: { createBirthday: jest.fn(async () => ({ id: 2 })) } },
    ProductService: { public: { updateProduct: jest.fn(async () => ({ id: 3 })) } },
    PricingService: {
      public: {
        createPricing: jest.fn(async () => ({ id: 4 })),
        updatePricing: jest.fn(async () => ({ id: 4 })),
      },
    },
  },
}));

import { ServiceLocator } from "../../../src/services";
import { upsertProduct } from "../../../src/ai/assistants/merchant/tools/product";
import { upsertPricing } from "../../../src/ai/assistants/merchant/tools/pricing";
import { MerchantScope } from "../../../src/ai/assistants/merchant/tools/types";
import { TOOLS_BY_NAME } from "../../../src/ai/assistants/merchant/tools/registry";

describe("gating policy: every data-mutating tool is sensitive, reads are not", () => {
  // Merchant confirms EVERY change on a card — create, edit, publish, archive, cancel.
  const WRITES = [
    "upsert_product", "upsert_pricing", "upsert_schedule", "upsert_package_template",
    "update_merchant", "update_location",
    "publish_product", "unpublish_product", "archive_product", "unarchive_product",
    "publish_package_template", "unpublish_package_template", "archive_package_template",
  ];
  const READS = [
    "list_my_products", "get_product", "get_merchant", "get_location", "describe_product_fields",
  ];

  it.each(WRITES)("%s is gated (parks a confirm card)", (name) => {
    expect(TOOLS_BY_NAME.get(name)?.sensitive).toBe(true);
  });

  it.each(READS)("%s is NOT gated (reads happen with no card)", (name) => {
    expect(TOOLS_BY_NAME.get(name)?.sensitive).toBe(false);
  });
});

const scope: MerchantScope = { merchantId: 10, locationId: 20, userId: 30 };
const createClass = ServiceLocator.ClassDetailsService.public.createClass as jest.Mock;
const createBirthday = ServiceLocator.BirthdayDetailsService.public.createBirthday as jest.Mock;
const updateProduct = ServiceLocator.ProductService.public.updateProduct as jest.Mock;
const createPricing = ServiceLocator.PricingService.public.createPricing as jest.Mock;
const updatePricing = ServiceLocator.PricingService.public.updatePricing as jest.Mock;

describe("upsert_product handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a CLASS with the correct nested body, pinned to scope.locationId", async () => {
    await upsertProduct.handler(
      {
        productType: "CLASS",
        product: { name: "Ballet", description: "fun", ageMin: 3, ageMax: 5 },
        details: { format: "INDEPENDENT", duration: 45, maxCapacity: 10 },
      } as never,
      scope,
    );
    expect(createClass).toHaveBeenCalledTimes(1);
    const [loc, dto] = createClass.mock.calls[0];
    expect(loc).toBe(scope.locationId); // location pinned, not model-supplied
    expect(dto.product.productType).toBe("CLASS");
    expect(dto.product.name).toBe("Ballet");
    expect(dto.classDetails.format).toBe("INDEPENDENT");
  });

  it("strips visibility flags so a create can't go live", async () => {
    await upsertProduct.handler(
      {
        productType: "CLASS",
        product: { name: "X", description: "d", ageMin: 3, ageMax: 5, isPublished: true, isArchived: true },
        details: { format: "INDEPENDENT", duration: 30, maxCapacity: 8 },
      } as never,
      scope,
    );
    const [, dto] = createClass.mock.calls[0];
    // The model's isPublished:true is stripped; the schema defaults it to draft.
    expect(dto.product.isPublished).toBe(false);
    expect(dto.product.isArchived).toBe(false);
  });

  it("routes BIRTHDAY to the birthdayDetails key with venueType", async () => {
    await upsertProduct.handler(
      {
        productType: "BIRTHDAY",
        product: { name: "Party", description: "d", ageMin: 3, ageMax: 10 },
        details: { venueType: "AT_LOCATION" },
      } as never,
      scope,
    );
    const [, dto] = createBirthday.mock.calls[0];
    expect(dto.birthdayDetails.venueType).toBe("AT_LOCATION");
    expect(createClass).not.toHaveBeenCalled();
  });

  it("rejects EVENT (unsupported product type)", async () => {
    await expect(
      upsertProduct.handler(
        { productType: "EVENT", product: { name: "X", description: "d", ageMin: 3, ageMax: 5 } } as never,
        scope,
      ),
    ).rejects.toMatchObject({ status: expect.stringMatching(/^BR_/) });
  });

  it("edits an existing product (productId, no details) via updateProduct", async () => {
    await upsertProduct.handler(
      { productType: "CLASS", productId: 99, product: { name: "Renamed" } } as never,
      scope,
    );
    expect(updateProduct).toHaveBeenCalledTimes(1);
    const [pid, dto] = updateProduct.mock.calls[0];
    expect(pid).toBe(99);
    expect(dto.name).toBe("Renamed");
    expect(createClass).not.toHaveBeenCalled();
  });
});

describe("upsert_pricing handler", () => {
  beforeEach(() => jest.clearAllMocks());
  const data = { name: "Std", price: 25, priceType: "SESSION", residencyType: "SG_RESIDENT" };

  it("creates pricing (no pricingId) and coerces a string price to a number", async () => {
    await upsertPricing.handler({ productId: 5, data: { ...data, price: "25" } } as never, scope);
    expect(createPricing).toHaveBeenCalledTimes(1);
    const [pid, dto] = createPricing.mock.calls[0];
    expect(pid).toBe(5);
    expect(dto.price).toBe(25); // "25" → 25 via coerceNumericData
  });

  it("edits pricing when pricingId is given (reuses the row, no duplicate)", async () => {
    await upsertPricing.handler({ productId: 5, pricingId: 8, data } as never, scope);
    expect(updatePricing).toHaveBeenCalledTimes(1);
    expect(updatePricing.mock.calls[0][0]).toBe(8); // pricingId is the first arg
    expect(createPricing).not.toHaveBeenCalled();
  });
});
