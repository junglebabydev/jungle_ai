import { BadRequestError } from "../../../errors/domains/BadRequestError";
import { ServiceLocator } from "../../../services";
import { MerchantScope } from "./tools/types";

/**
 * Resolve the location a location-scoped tool should act on, for a possibly
 * merchant-scoped conversation (`scope.locationId` may be null):
 *
 *   1. a pinned scope location (legacy/active-store conversation) → use it;
 *   2. otherwise the merchant's SOLE location → use it (the common case once
 *      the frontend stops sending locationId);
 *   3. zero or several locations and none pinned → throw a friendly
 *      `BadRequestError.AiLocationRequired` the agent relays in plain language
 *      (it can then ask which location, or guide them to add one).
 *
 * The pinned id is already merchant-verified by `requireMerchantOwner`; the
 * sole/listed ids come from the merchant's own record, so the result always
 * belongs to the pinned merchant.
 */
export async function resolveLocationId(scope: MerchantScope): Promise<number> {
  if (scope.locationId != null) return scope.locationId;

  const merchant = await ServiceLocator.MerchantService.public.getMerchantById(
    scope.merchantId,
    { withLocations: true },
  );
  const locationIds = (
    (merchant as { locations?: { id?: unknown }[] }).locations ?? []
  )
    .map((location) => location.id)
    .filter((id): id is number => typeof id === "number");

  if (locationIds.length === 1) return locationIds[0];
  if (locationIds.length === 0) {
    throw BadRequestError.AiLocationRequired(
      "the merchant has no location set up yet — add one first",
    );
  }
  throw BadRequestError.AiLocationRequired(
    "the merchant has several locations — ask which one to use",
  );
}
