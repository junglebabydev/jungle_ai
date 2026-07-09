import {
  runConciergeTurn,
  RunConciergeTurnInput,
  RunConciergeTurnResult,
} from "./loop";

/**
 * CONCIERGE — PRODUCT-DISCOVERY MODE (parent, global search).
 *
 * The parent-facing chat on the `/concierge` page: a parent searches across the
 * WHOLE public catalogue (every provider, every location). This is the default
 * concierge — there is NO merchant-location scope, so the search ranges over all merchants.
 *
 * It's a thin entry point over the shared concierge engine (`runConciergeTurn`)
 * with the scope deliberately omitted. The sibling `merchantLocationChat.ts` is the same engine
 * pinned to one merchant/location. Splitting them keeps each mode something you
 * can open and read, while the engine stays in exactly one place (DRY).
 */
export type RunProductDiscoveryInput = Omit<RunConciergeTurnInput, "scope">;

export function runProductDiscovery(
  input: RunProductDiscoveryInput,
): Promise<RunConciergeTurnResult> {
  // No scope → the engine searches the entire public catalogue.
  return runConciergeTurn(input);
}
