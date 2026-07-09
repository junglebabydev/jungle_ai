import { ConciergeScope } from "../../../shared/dtos/ConciergeDTOs";
import {
  runConciergeTurn,
  RunConciergeTurnInput,
  RunConciergeTurnResult,
} from "./loop";

/**
 * CONCIERGE — MERCHANT-LOCATION-CHAT MODE (parent, one merchant/location).
 *
 * The parent-facing chat opened from a specific merchant/location card —
 * "the concierge for THIS place". Same engine as discovery, but the scope is
 * REQUIRED: every search is hard-pinned to this merchant/location (server-side,
 * the model can't widen out) and limited to that merchant-location's activities.
 *
 * A thin entry point over the shared engine (`runConciergeTurn`) with a required
 * `scope`. The sibling `discovery.ts` is the same engine with no scope (search
 * all). The router picks which one to call based on whether the request carries
 * a `merchantId`/`locationId`.
 */
export type RunMerchantLocationChatInput = Omit<RunConciergeTurnInput, "scope"> & {
  /** Required: which merchant/location this merchant-location chat is pinned to. */
  scope: ConciergeScope;
};

export function runMerchantLocationChat(
  input: RunMerchantLocationChatInput,
): Promise<RunConciergeTurnResult> {
  // Scope is always present here → the engine pins every search to this merchant-location.
  return runConciergeTurn(input);
}
