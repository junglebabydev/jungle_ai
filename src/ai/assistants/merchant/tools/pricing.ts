import { PRICE_TYPE, PRODUCT_TYPE } from "@prisma/client";
import { ServiceLocator } from "../../../../services";
import { BadRequestError } from "../../../../errors/domains/BadRequestError";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import {
  CreatePricingSchema,
  UpdatePricingSchema,
} from "../../../../shared/dtos/PricingDTOs";
import { defineTool } from "./types";
import { id, dataPayload, coerceNumericData, parseDto } from "./common";
import { resolveLocationId } from "../location";

/**
 * Which price units make sense for each kind of product.
 *
 * The unit is not decoration: it is shown to parents beside the figure, so a camp
 * week recorded as a session produces a number that looks right and means something
 * else. Deliberately permissive where a merchant could genuinely sell either way
 * (a class sold as a term, a package, or per session), and strict only where the
 * pairing could not be true — which is where the wrong-meaning risk actually is.
 */
const PRICE_TYPES_BY_PRODUCT: Record<PRODUCT_TYPE, readonly PRICE_TYPE[]> = {
  [PRODUCT_TYPE.CAMP]: [
    PRICE_TYPE.CAMP_WEEK,
    PRICE_TYPE.CAMP_DAY,
    PRICE_TYPE.TRIAL,
  ],
  [PRODUCT_TYPE.CLASS]: [
    PRICE_TYPE.TERM,
    PRICE_TYPE.PACKAGE,
    PRICE_TYPE.SESSION,
    PRICE_TYPE.TRIAL,
    PRICE_TYPE.MEMBERSHIP,
  ],
  [PRODUCT_TYPE.DROP_IN]: [
    PRICE_TYPE.DROP_IN_SESSION,
    PRICE_TYPE.SESSION,
    PRICE_TYPE.PACKAGE,
    PRICE_TYPE.MEMBERSHIP,
    PRICE_TYPE.TRIAL,
  ],
  [PRODUCT_TYPE.BIRTHDAY]: [PRICE_TYPE.PARTY_BASE, PRICE_TYPE.PARTY_ADDON],
  [PRODUCT_TYPE.EVENT]: [PRICE_TYPE.SESSION, PRICE_TYPE.PACKAGE],
};

export const upsertPricing = defineTool({
  name: "upsert_pricing",
  description:
    "Add or edit a price option for a product. Omit pricingId to create; include it to edit. Prices come ONLY from explicit merchant input — never invent or default an amount. Put the price fields in `data`.",
  input: { productId: id, pricingId: id.optional(), data: dataPayload },
  requiredPermissions: (args) =>
    args.pricingId !== undefined
      ? [PERMISSIONS_MAP.PRICING_UPDATE.code]
      : [PERMISSIONS_MAP.PRICING_CREATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  /**
   * Stop a price being saved under a unit its product cannot have. Runs before the
   * change is parked, so the merchant never confirms a card carrying a figure that
   * would reach parents meaning the wrong thing.
   */
  preParkValidate: async (args) => {
    const data = args.data as { priceType?: unknown } | undefined;
    const priceType = data?.priceType;
    // Nothing to check when the merchant did not name a unit — the DTO decides
    // whether it is required, and this guard only judges a unit that IS present.
    if (typeof priceType !== "string") return;

    const product = await ServiceLocator.ProductService.public.getProductById(
      args.productId,
      {},
    );
    const allowed = PRICE_TYPES_BY_PRODUCT[product.productType];
    if (!allowed || allowed.includes(priceType as PRICE_TYPE)) return;

    throw BadRequestError.ImplausiblePriceType(
      priceType,
      product.productType,
      allowed,
    );
  },
  handler: async (args, scope) => {
    const data = coerceNumericData(args.data) as Record<string, unknown>;
    if (args.pricingId !== undefined) {
      return ServiceLocator.PricingService.public.updatePricing(
        args.pricingId,
        parseDto(UpdatePricingSchema, data),
        {
          productId: args.productId,
          locationId: await resolveLocationId(scope),
        },
      );
    }
    return ServiceLocator.PricingService.public.createPricing(
      args.productId,
      parseDto(CreatePricingSchema, data),
    );
  },
});
