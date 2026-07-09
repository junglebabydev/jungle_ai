import { PRICE_TYPE } from "@prisma/client";
import { ServiceLocator } from "../../../../services";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import {
  CreateCampOptionBodySchema,
  UpdateCampOptionSchema,
} from "../../../../shared/dtos/CampOptionDTOs";
import { defineTool } from "./types";
import {
  id,
  dataPayload,
  coerceNumericData,
  parseDto,
  stripVisibilityFlags,
  onlyProvided,
} from "./common";

/**
 * Camp options — a camp's bookable weeks/slots. Each option is its own row with
 * its own dates, times, capacity, and price (the platform books/registers against
 * CampOption directly). The base camp (Product + CampDetails) is set via
 * upsert_product; these add the individual sellable options on top.
 */

export const upsertCampOption = defineTool({
  name: "upsert_camp_option",
  description:
    "Add or edit a CAMP OPTION — one bookable week/slot of a camp (a camp can have several). Omit campOptionId to create; include it to edit. Each option has its OWN: name (e.g. 'Week 1'), startDate + endDate (YYYY-MM-DD), startTime + endTime ('HH:MM' 24-hour), optional ageMin/ageMax, capacity (whole number of seats), price (number) with priceType (" +
    `${PRICE_TYPE.CAMP_DAY} | ${PRICE_TYPE.CAMP_WEEK}` +
    "), and isAvailable (set false to stop bookings WITHOUT removing the option). Dates, capacity, and price come from the merchant — never invent them. Put the option fields in `data`. To remove an option, use archive_camp_option, not this.",
  input: { productId: id, campOptionId: id.optional(), data: dataPayload },
  requiredPermissions: (args) =>
    args.campOptionId !== undefined
      ? [PERMISSIONS_MAP.PRODUCT_UPDATE.code]
      : [PERMISSIONS_MAP.PRODUCT_CREATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  handler: async (args) => {
    const raw = stripVisibilityFlags(
      coerceNumericData(args.data) as Record<string, unknown>,
    );

    if (args.campOptionId !== undefined) {
      // EDIT: forward ONLY the fields the merchant actually set. The partial
      // UPDATE schema fires isAvailable/isArchived `.default()`s for omitted keys,
      // and updateCampOption merges with `?? existing` — so passing the full parsed
      // object would silently un-archive / flip availability on every edit.
      const parsed = parseDto(UpdateCampOptionSchema, raw);
      return ServiceLocator.CampOptionService.public.updateCampOption(
        args.campOptionId,
        args.productId,
        onlyProvided(parsed, raw),
      );
    }

    return ServiceLocator.CampOptionService.public.createCampOption({
      ...parseDto(CreateCampOptionBodySchema, raw),
      productId: args.productId,
    });
  },
});

export const archiveCampOption = defineTool({
  name: "archive_camp_option",
  description:
    "Remove (archive) a single camp option so it's no longer offered for booking. The merchant confirms before it happens. Use the campOptionId from get_product. This only hides the option going forward; it does not affect past bookings.",
  input: { productId: id, campOptionId: id },
  requiredPermissions: [PERMISSIONS_MAP.PRODUCT_UPDATE.code],
  sensitive: true,
  handler: async (args) =>
    ServiceLocator.CampOptionService.public.updateCampOption(
      args.campOptionId,
      args.productId,
      { isArchived: true },
    ),
});
