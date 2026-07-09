import { ServiceLocator } from "../../../../services";
import { BadRequestError } from "../../../../errors/domains/BadRequestError";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import { UpdateProductSchema } from "../../../../shared/dtos/ProductDTOs";
import {
  CreateClassSchema,
  UpdateClassSchema,
} from "../../../../shared/dtos/ClassDetailsDTOs";
import {
  CreateCampSchema,
  UpdateCampSchema,
} from "../../../../shared/dtos/CampDetailsDTOs";
import {
  CreateBirthdaySchema,
  UpdateBirthdaySchema,
} from "../../../../shared/dtos/BirthdayDetailsDTOs";
import {
  CreateDropInSchema,
  UpdateDropInSchema,
} from "../../../../shared/dtos/DropInDetailsDTOs";
import { defineTool } from "./types";
import {
  id,
  productTypeEnum,
  dataPayload,
  coerceNumericData,
  stripVisibilityFlags,
  parseDto,
} from "./common";
import { resolveLocationId } from "../location";

type DetailsType = "CLASS" | "CAMP" | "BIRTHDAY" | "DROP_IN";

/**
 * How the nested create/update body names the type-specific details block —
 * this is the exact shape the matching Create<Type>Schema validates (proven by
 * the working MCP, which posted these same bodies to the HTTP routes).
 */
const DETAILS_KEY: Record<DetailsType, string> = {
  CLASS: "classDetails",
  CAMP: "campDetails",
  BIRTHDAY: "birthdayDetails",
  DROP_IN: "dropInDetails",
};

/** Edit a product's type-specific details: resolve the details id, then update. */
async function updateDetails(
  productType: DetailsType,
  productId: number,
  product: Record<string, unknown>,
  details: Record<string, unknown>,
): Promise<unknown> {
  const body = {
    ...(Object.keys(product).length > 0 ? { product } : {}),
    [DETAILS_KEY[productType]]: details,
  };

  switch (productType) {
    case "CLASS": {
      const existing =
        await ServiceLocator.ClassDetailsService.public.getClassDetailsByProductId(
          productId,
          {},
        );
      return ServiceLocator.ClassDetailsService.public.updateClass(
        existing.id,
        productId,
        parseDto(UpdateClassSchema, body),
      );
    }
    case "CAMP": {
      const existing =
        await ServiceLocator.CampDetailsService.public.getCampDetailsByProduct(
          productId,
          {},
        );
      return ServiceLocator.CampDetailsService.public.updateCamp(
        existing.id,
        productId,
        parseDto(UpdateCampSchema, body),
      );
    }
    case "BIRTHDAY": {
      const existing =
        await ServiceLocator.BirthdayDetailsService.public.getBirthdayDetailsByProduct(
          productId,
          {},
        );
      return ServiceLocator.BirthdayDetailsService.public.updateBirthday(
        existing.id,
        productId,
        parseDto(UpdateBirthdaySchema, body),
      );
    }
    case "DROP_IN": {
      const existing =
        await ServiceLocator.DropInDetailsService.public.getDropInDetailsByProduct(
          productId,
          {},
        );
      return ServiceLocator.DropInDetailsService.public.updateDropIn(
        existing.id,
        productId,
        parseDto(UpdateDropInSchema, body),
      );
    }
  }
}

export const upsertProduct = defineTool({
  name: "upsert_product",
  description:
    "Create or edit a product as a DRAFT (never publishes or archives). Provide `product` { name, description, ageMin, ageMax } and a type-specific `details` block (call describe_product_fields for what each type needs). Omit productId to create; include it to edit the product and/or details fields. IMPORTANT: price, dates, and capacity are NOT set here — use upsert_pricing and upsert_schedule separately. EVENT is not supported yet.",
  input: {
    productType: productTypeEnum,
    productId: id.optional(),
    product: dataPayload.optional(),
    details: dataPayload.optional(),
  },
  // Create → product.create; edit → product.update (mirrors the HTTP routes).
  requiredPermissions: (args) =>
    args.productId !== undefined
      ? [PERMISSIONS_MAP.PRODUCT_UPDATE.code]
      : [PERMISSIONS_MAP.PRODUCT_CREATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  // Pre-park guard: refuse to create a product whose name already exists at the
  // location. Deterministically stops a weaker model from spawning duplicates by
  // re-creating across turns (the relayed failure tells it to edit the existing id).
  preParkValidate: async (args, scope) => {
    if (args.productId !== undefined) return; // only guards CREATE
    const name = (args.product as { name?: unknown } | undefined)?.name;
    if (typeof name !== "string" || !name.trim()) return;
    const locationId = await resolveLocationId(scope);
    const existing = await ServiceLocator.ProductService.public.listProducts(
      { locationId },
      {},
    );
    const dup = existing.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (dup) throw BadRequestError.DuplicateProductName(name, dup.id);
  },
  handler: async (args, scope) => {
    const { productType, productId } = args;
    const product = stripVisibilityFlags(
      coerceNumericData(args.product ?? {}) as Record<string, unknown>,
    );
    const details = coerceNumericData(args.details ?? {}) as Record<string, unknown>;

    // Edit an existing product.
    if (productId !== undefined) {
      if (Object.keys(details).length === 0) {
        // Product-only edit → generic product update.
        return ServiceLocator.ProductService.public.updateProduct(
          productId,
          parseDto(UpdateProductSchema, product),
        );
      }
      if (productType === "EVENT") {
        throw BadRequestError.UnsupportedProductType("EVENT");
      }
      return updateDetails(productType, productId, product, details);
    }

    // Create a new draft via the type-specific route.
    if (productType === "EVENT") {
      throw BadRequestError.UnsupportedProductType("EVENT");
    }
    const body = {
      product: { ...product, productType },
      [DETAILS_KEY[productType]]: details,
    };
    const loc = await resolveLocationId(scope);
    switch (productType) {
      case "CLASS":
        return ServiceLocator.ClassDetailsService.public.createClass(
          loc,
          parseDto(CreateClassSchema, body),
        );
      case "CAMP":
        return ServiceLocator.CampDetailsService.public.createCamp(
          loc,
          parseDto(CreateCampSchema, body),
        );
      case "BIRTHDAY":
        return ServiceLocator.BirthdayDetailsService.public.createBirthday(
          loc,
          parseDto(CreateBirthdaySchema, body),
        );
      case "DROP_IN":
        return ServiceLocator.DropInDetailsService.public.createDropIn(
          loc,
          parseDto(CreateDropInSchema, body),
        );
    }
  },
});

export const publishProduct = defineTool({
  name: "publish_product",
  description:
    "Publish a product (sets isPublished=true) — the only action that makes a product live. Call this ONLY after the merchant has explicitly confirmed they want to publish. It is never a side effect of creating or editing.",
  input: { productId: id },
  requiredPermissions: [PERMISSIONS_MAP.PRODUCT_UPDATE.code],
  sensitive: true,
  handler: (args) =>
    ServiceLocator.ProductService.public.publishProduct(args.productId),
});

export const archiveProduct = defineTool({
  name: "archive_product",
  description:
    "Remove (archive) a product from the merchant's active listings. DESTRUCTIVE — call ONLY after the merchant has explicitly confirmed removing the specific named product. Archive hides it from listings (reversible by support); treat it as a removal the merchant must confirm.",
  input: { productId: id },
  requiredPermissions: [PERMISSIONS_MAP.PRODUCT_UPDATE.code],
  sensitive: true,
  handler: (args) =>
    ServiceLocator.ProductService.public.archiveProduct(args.productId),
});

export const unpublishProduct = defineTool({
  name: "unpublish_product",
  description:
    "Unpublish a product (sets isPublished=false) — takes a live product back to DRAFT so customers can no longer see or book it, but keeps it in the merchant's catalog (not removed). Use this when the merchant wants to temporarily hide a published product. To remove it from the catalog entirely, use archive_product. Call only after the merchant has explicitly confirmed.",
  input: { productId: id },
  requiredPermissions: [PERMISSIONS_MAP.PRODUCT_UPDATE.code],
  sensitive: true,
  handler: (args) =>
    ServiceLocator.ProductService.public.updateProduct(
      args.productId,
      parseDto(UpdateProductSchema, { isPublished: false }),
    ),
});

export const unarchiveProduct = defineTool({
  name: "unarchive_product",
  description:
    "Restore (unarchive) a previously archived product (sets isArchived=false). It comes back as a DRAFT — it is NOT republished, so publish_product is still a separate step to make it live again. Use when the merchant wants to recover a product they removed. Call only after the merchant has explicitly confirmed.",
  input: { productId: id },
  requiredPermissions: [PERMISSIONS_MAP.PRODUCT_UPDATE.code],
  sensitive: true,
  handler: (args) =>
    ServiceLocator.ProductService.public.updateProduct(
      args.productId,
      parseDto(UpdateProductSchema, { isArchived: false }),
    ),
});
