import { LOCATION_TYPE, SG_REGIONS } from "@prisma/client";
import { ServiceLocator } from "../../../../services";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import { UpdateLocationSchema } from "../../../../shared/dtos/LocationDTOs";
import { UpdateMerchantSchema } from "../../../../shared/dtos/MerchantDTOs";
import { defineTool } from "./types";
import { dataPayload, coerceNumericData, parseDto } from "./common";
import { resolveLocationId } from "../location";

export const updateLocation = defineTool({
  name: "update_location",
  description:
    "Update the current location's details (address, operating hours, contact, type, region, etc.). `data.locationType` is one of " +
    Object.values(LOCATION_TYPE).join(" | ") +
    "; `data.sgRegion` is one of " +
    Object.values(SG_REGIONS).join(" | ") +
    ". Put the changed fields in `data`.",
  input: { data: dataPayload },
  requiredPermissions: [PERMISSIONS_MAP.LOCATION_UPDATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  handler: async (args, scope) =>
    ServiceLocator.LocationService.public.updateLocation(
      await resolveLocationId(scope),
      parseDto(UpdateLocationSchema, coerceNumericData(args.data)),
    ),
});

export const updateMerchant = defineTool({
  name: "update_merchant",
  description:
    "Update the merchant's business profile (name, GST status, logo, brand colour, contact, etc.). GST status comes from the merchant — never invent it. Put the changed fields in `data`.",
  input: { data: dataPayload },
  requiredPermissions: [PERMISSIONS_MAP.MERCHANT_UPDATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  handler: (args, scope) =>
    ServiceLocator.MerchantService.public.updateMerchant(
      scope.merchantId,
      parseDto(UpdateMerchantSchema, coerceNumericData(args.data)),
    ),
});
