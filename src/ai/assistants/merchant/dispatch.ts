import { z, ZodError } from "zod";
import ApplicationError from "../../../errors/ApplicationError";
import { AuthError } from "../../../errors/domains/AuthError";
import { mapZodError } from "../../../utils/validations/zodError";
import { toToolFailure, toolOk, ToolResult } from "./errors";
import { assertResourceOwnership } from "./ownership";
import { AnyMerchantTool, MerchantScope } from "./tools/types";

/**
 * Run ONE tool with the same guarantees the HTTP path provided, in-process:
 *
 *   1. validateBody-equivalent — parse the model-facing args against the tool's
 *      Zod input shape (a ZodError becomes the same BR_023 the route would send).
 *   2. requirePermission-equivalent — enforce the tool's required permission
 *      code(s) against the per-request resolved set (computed ONCE per turn via
 *      the shared `resolvePermissions` RBAC core). Codes may depend on the args
 *      (e.g. upsert → create vs update).
 *   3. run the handler, which calls services via ServiceLocator.
 *
 * Ownership (does the caller belong to this merchant?) is enforced once at the
 * router by `requireMerchantOwner` + the pinned conversation scope, so it is not
 * re-checked here — only the per-tool capability is.
 *
 * Errors are relayed faithfully: a typed `ApplicationError` (incl. AuthError.
 * Forbidden → ATH_005) becomes a `{ ok:false, code, message, missingRequired? }`
 * tool result the model interprets; an unexpected error rethrows to the loop.
 */
export async function dispatchTool(
  tool: AnyMerchantTool,
  rawArgs: unknown,
  scope: MerchantScope,
  permissions: Set<string>,
): Promise<ToolResult> {
  try {
    // (1) validate the model-facing envelope
    const args = z.object(tool.input).parse(rawArgs ?? {});

    // (2) Resource ownership — a model-supplied resource id (productId /
    //     packageTemplateId) MUST resolve to the pinned scope. In-process
    //     equivalent of requireProductOwner / requireMerchantOwner (plan §3.2).
    await assertResourceOwnership(args, scope);

    // (3) RBAC — required codes may be a function of the validated args
    const required =
      typeof tool.requiredPermissions === "function"
        ? tool.requiredPermissions(args as never)
        : tool.requiredPermissions;
    for (const code of required) {
      if (!permissions.has(code)) return toToolFailure(AuthError.Forbidden);
    }

    // (4) run the handler (services are called internally)
    const data = await tool.handler(args as never, scope);
    return toolOk(data);
  } catch (e) {
    if (e instanceof ApplicationError) return toToolFailure(e);
    if (e instanceof ZodError) return toToolFailure(mapZodError(e));
    throw e;
  }
}
