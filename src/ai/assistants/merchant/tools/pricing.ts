import { ServiceLocator } from "../../../../services";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import {
  CreatePricingSchema,
  UpdatePricingSchema,
} from "../../../../shared/dtos/PricingDTOs";
import { defineTool } from "./types";
import { id, dataPayload, coerceNumericData, parseDto } from "./common";
import { resolveLocationId } from "../location";

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
