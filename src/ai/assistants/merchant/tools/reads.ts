import { z } from "zod";
import { ServiceLocator } from "../../../../services";
import { ProductFilter } from "../../../../shared/dtos/ProductDTOs";
import { ALL_CONFIG_KINDS, describeFields } from "../manifest";
import { defineTool } from "./types";
import { id, productTypeEnum } from "./common";
import { resolveLocationId } from "../location";

/**
 * Read tools (idempotent, public reads — no permission gate, mirroring the
 * booking_system product/merchant/location GET routes). merchantId/locationId
 * are pinned from the conversation scope, never supplied by the model.
 */

export const listMyProducts = defineTool({
  name: "list_my_products",
  description:
    "List the merchant's full catalog: products AND packages/memberships. Returns { products, packages }. Pass locationId to scope products to one location; omit it to include all the merchant's locations. Archived (removed) products are hidden by default — pass includeArchived=true to also list them, e.g. when the merchant wants to find or RESTORE something they previously removed. Use this to ground edits and to summarize what the merchant currently offers.",
  input: {
    locationId: id.optional(),
    productType: productTypeEnum.optional(),
    includeArchived: z.boolean().optional(),
  },
  requiredPermissions: [],
  sensitive: false,
  handler: async (args, scope) => {
    const locationIds =
      args.locationId !== undefined
        ? [args.locationId]
        : await merchantLocationIds(scope.merchantId);

    const [productLists, packages] = await Promise.all([
      Promise.all(
        locationIds.map((locationId) =>
          ServiceLocator.ProductService.public.listProducts(
            {
              locationId,
              ...(args.productType !== undefined
                ? { productType: args.productType }
                : {}),
              ...(args.includeArchived ? { includeArchived: true } : {}),
            } as ProductFilter,
            {},
          ),
        ),
      ),
      ServiceLocator.PackageTemplateService.public.listPackageTemplatesByMerchant(
        scope.merchantId,
        {},
      ),
    ]);
    return { products: productLists.flat(), packages };
  },
});

async function merchantLocationIds(merchantId: number): Promise<number[]> {
  const merchant = await ServiceLocator.MerchantService.public.getMerchantById(
    merchantId,
    { withLocations: true },
  );
  const locations = (merchant as { locations?: { id?: unknown }[] }).locations ?? [];
  return locations
    .map((location) => location.id)
    .filter((locationId): locationId is number => typeof locationId === "number");
}

export const getProduct = defineTool({
  name: "get_product",
  description:
    "Get a single product by its numeric id with FULL current detail: the base product plus its current pricing options and schedules. Returns { product, pricing, schedules }, each pricing/schedule row carrying its own id. For a CAMP it ALSO returns `campDetails` (venue, meals/bus, etc.) and `campOptions` — the camp's bookable weeks/slots, each with its own id. Use before editing so changes are grounded in current state — and reuse a returned pricing id (as pricingId), schedule id (as scheduleId), or camp option id (as campOptionId) to EDIT that existing row via upsert_pricing / upsert_schedule / upsert_camp_option, rather than creating a duplicate.",
  input: { productId: id },
  requiredPermissions: [],
  sensitive: false,
  handler: async (args) => {
    const [product, pricing, schedules, campDetails] = await Promise.all([
      ServiceLocator.ProductService.public.getProductById(args.productId, {}),
      ServiceLocator.PricingService.public.listPricingByProduct(args.productId, {}),
      ServiceLocator.ScheduleService.public.listSchedulesByProduct(args.productId, {}),
      // Camps keep their venue/meal/bus info + bookable options in CampDetails;
      // non-camps have none (the lookup throws), so degrade to null gracefully.
      ServiceLocator.CampDetailsService.public
        .getCampDetailsByProduct(args.productId, { withOptions: true })
        .catch(() => null),
    ]);

    if (!campDetails) return { product, pricing, schedules };

    // Surface the camp's details plus its options separately, hiding archived ones
    // (the camp-details lookup doesn't filter them, but products hide archived).
    const { options, ...details } = campDetails;
    const campOptions = (options ?? []).filter((o) => !o.isArchived);
    return {
      product,
      pricing,
      schedules,
      campDetails: details,
      ...(campOptions.length ? { campOptions } : {}),
    };
  },
});

export const getMerchant = defineTool({
  name: "get_merchant",
  description:
    "Get the merchant's business profile — name, GST status, contact, logo, brand colour — plus its locations. Use this to answer questions about 'my store' / business details, and to ground edits to the profile before update_merchant.",
  input: {} as z.ZodRawShape,
  requiredPermissions: [],
  sensitive: false,
  handler: async (_args, scope) =>
    ServiceLocator.MerchantService.public.getMerchantById(scope.merchantId, {
      withLocations: true,
    }),
});

export const getLocation = defineTool({
  name: "get_location",
  description:
    "Get the current location's full details — address, operating hours, contact, media. Use to describe the location and to ground edits before update_location.",
  input: {} as z.ZodRawShape,
  requiredPermissions: [],
  sensitive: false,
  handler: async (_args, scope) =>
    ServiceLocator.LocationService.public.getLocationById(
      await resolveLocationId(scope),
      {
        withDetails: true,
        withOperatingHrs: true,
        withMedia: true,
      },
    ),
});

export const describeProductFields = defineTool({
  name: "describe_product_fields",
  description:
    "Describe which fields a product type (CLASS, CAMP, BIRTHDAY, DROP_IN, EVENT) or package kind (PACKAGE, MEMBERSHIP) needs: which must come from the merchant (commercial values — never invent) vs which you may draft (descriptive). Use this to drive what you ask the merchant next. The API's missing-required list remains authoritative.",
  input: { kind: z.string() },
  requiredPermissions: [],
  sensitive: false,
  handler: async (args) => {
    const fields = describeFields(args.kind);
    if (!fields) {
      return {
        found: false,
        message: `Unknown kind "${args.kind}".`,
        availableKinds: ALL_CONFIG_KINDS,
      };
    }
    return { found: true, ...fields };
  },
});
