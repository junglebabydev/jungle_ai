/**
 * The agent tool contract. A tool is a pure-ish definition (SRP): name,
 * model-legible description, Zod input shape (the model-facing args ONLY —
 * merchantId/locationId are pinned server-side via MerchantScope, never supplied by
 * the model), the booking_system permission code(s) it requires, whether it is
 * a sensitive/gated action, and a handler that calls services via ServiceLocator.
 *
 * Handlers depend only on ServiceLocator + MerchantScope (DIP) — unit-testable with
 * a mocked locator, never on transport.
 */

import { z } from "zod";

/**
 * Verified, pinned scope for a conversation. Injected by the dispatcher.
 * `locationId` is OPTIONAL: a merchant-scoped conversation has none, in which
 * case a location-scoped tool resolves its target via `resolveLocationId`
 * (the merchant's sole location, else it asks / guides). `merchantId` is always
 * the authoritative tenant boundary and is re-checked per resource id.
 */
export type MerchantScope = {
  merchantId: number;
  locationId?: number | null;
  userId: number;
};

export type MerchantToolHandler<S extends z.ZodRawShape> = (
  args: z.infer<z.ZodObject<S>>,
  scope: MerchantScope,
) => Promise<unknown>;

/**
 * The PERMISSIONS_MAP codes a tool requires. Either a fixed list, or a function
 * of the (validated) args — so a single `upsert_*` tool can require `*.create`
 * when creating and `*.update` when editing, exactly as the HTTP routes did.
 */
export type RequiredPermissions<S extends z.ZodRawShape> =
  | readonly string[]
  | ((args: z.infer<z.ZodObject<S>>) => readonly string[]);

export type MerchantTool<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  /** Model-facing input shape (no merchantId/locationId — those are pinned). */
  input: S;
  /** PERMISSIONS_MAP codes the caller must hold (empty = public read). */
  requiredPermissions: RequiredPermissions<S>;
  /** Gated action — the model may never execute it; the loop parks a confirm card.
   *  ALL data-mutating tools are sensitive: the merchant confirms every create,
   *  update, publish, unpublish, archive, and cancel on a card. Only reads are not. */
  sensitive: boolean;
  /** Optional pre-park guard for a sensitive tool: runs BEFORE the confirm card is
   *  created, alongside the ownership re-check. Throw an ApplicationError to block
   *  (the loop relays it to the model as a tool failure, never a card) — e.g. to
   *  stop a duplicate-name create. No-op return = allowed. */
  preParkValidate?: MerchantToolHandler<S>;
  handler: MerchantToolHandler<S>;
};

/** Identity helper that preserves the precise input-shape type per tool. */
export function defineTool<S extends z.ZodRawShape>(
  tool: MerchantTool<S>,
): MerchantTool<S> {
  return tool;
}

/**
 * A tool with its input-shape type erased to the base `ZodRawShape` — the
 * element type for the heterogeneous registry (mirrors the MCP's `AnyToolDef`).
 * `never` for the handler arg keeps every specific handler assignable.
 */
export type AnyMerchantTool = {
  name: string;
  description: string;
  input: z.ZodRawShape;
  requiredPermissions: readonly string[] | ((args: never) => readonly string[]);
  sensitive: boolean;
  preParkValidate?: (args: never, scope: MerchantScope) => Promise<unknown>;
  handler: (args: never, scope: MerchantScope) => Promise<unknown>;
};
