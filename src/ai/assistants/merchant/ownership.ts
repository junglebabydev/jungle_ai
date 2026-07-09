import { AuthError } from "../../../errors/domains/AuthError";
import { NotFoundError } from "../../../errors/domains/NotFoundError";
import { ServiceLocator } from "../../../services";
import { MerchantScope } from "./tools/types";

/**
 * Per-tool resource-ownership re-check — the in-process equivalent of the HTTP
 * routes' `requireProductOwner` / `requireMerchantOwner` (plan §3.2).
 *
 * A tool's model-supplied resource id (productId / packageTemplateId) is NOT
 * pinned scope — a prompt-injection or hallucinated id could otherwise reach
 * another merchant's row (the model is explicitly told tool results are
 * untrusted data). Pinning the conversation's merchant/location alone does NOT
 * validate a model-supplied id; this closes that gap.
 *
 * Mirrors `requireProductOwner` exactly (product.locationId === pinned location)
 * and additionally binds packages to the pinned merchant. Throws the same typed
 * errors the middleware does, which the dispatcher relays as a tool failure.
 */
export async function assertResourceOwnership(
  args: unknown,
  scope: MerchantScope,
): Promise<void> {
  const a = (args ?? {}) as { productId?: unknown; packageTemplateId?: unknown };
  // Ids arrive as RAW tool-call JSON (pre-Zod-coercion); the model often sends
  // them as strings ("63"). COERCE — a `typeof === "number"` check would SKIP the
  // ownership re-check on a string id, letting a foreign id slip the cross-tenant
  // boundary. This is the security backstop; it must not be bypassable by type.
  const toId = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const productId = toId(a.productId);
  const packageTemplateId = toId(a.packageTemplateId);

  if (productId !== null) {
    const product =
      await ServiceLocator.ProductService.internal.findProductById(productId);
    if (!product) throw NotFoundError.Product;
    if (scope.locationId != null) {
      // Location pinned (active-store conversation): the product must live in
      // that exact location — the original requireProductOwner behaviour.
      if (product.locationId !== scope.locationId) throw AuthError.Forbidden;
    } else {
      // Merchant-scoped conversation: no pinned location, so bind the product to
      // the pinned MERCHANT instead (its location must belong to this merchant).
      // Without this, a model-supplied id could cross tenants.
      const location =
        await ServiceLocator.LocationService.internal.findLocationById(
          product.locationId,
        );
      if (!location || location.merchantId !== scope.merchantId)
        throw AuthError.Forbidden;
    }
  }

  if (packageTemplateId !== null) {
    const pkg =
      await ServiceLocator.PackageTemplateService.internal.getPackageTemplateById(
        packageTemplateId,
      );
    if (pkg.merchantId !== scope.merchantId) throw AuthError.Forbidden;
  }
}
