import { ServiceLocator } from "../../../../services";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import {
  CreatePackageTemplateBodySchema,
  UpdatePackageTemplateBodySchema,
} from "../../../../shared/dtos/PackageTemplateDTOs";
import { defineTool } from "./types";
import { id, dataPayload, coerceNumericData, stripVisibilityFlags, parseDto } from "./common";

export const upsertPackageTemplate = defineTool({
  name: "upsert_package_template",
  description:
    "Add or edit a package or membership (PackageTemplate). Omit packageTemplateId to create; include it to edit. `data` requires name, kind (REGULAR | TERM | TRIAL | SUBSCRIPTION | MEMBERSHIP), and price (>0). Credits, validity, price, and billing period come from the merchant — never invent them. Created as a draft (isPublic=false); publish_package_template is the separate, explicit step that makes it visible.",
  input: { packageTemplateId: id.optional(), data: dataPayload },
  requiredPermissions: (args) =>
    args.packageTemplateId !== undefined
      ? [PERMISSIONS_MAP.PACKAGE_TEMPLATE_UPDATE.code]
      : [PERMISSIONS_MAP.PACKAGE_TEMPLATE_CREATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  handler: (args, scope) => {
    const data = stripVisibilityFlags(
      coerceNumericData(args.data) as Record<string, unknown>,
    );
    if (args.packageTemplateId !== undefined) {
      return ServiceLocator.PackageTemplateService.public.updatePackageTemplate({
        ...parseDto(UpdatePackageTemplateBodySchema, data),
        packageTemplateId: args.packageTemplateId,
        merchantId: scope.merchantId,
      });
    }
    // Force the draft state the agent contract promises (the API defaults
    // isPublic to TRUE on create).
    return ServiceLocator.PackageTemplateService.public.createPackageTemplate(
      scope.userId,
      {
        ...parseDto(CreatePackageTemplateBodySchema, { ...data, isPublic: false }),
        merchantId: scope.merchantId,
      },
    );
  },
});

export const publishPackageTemplate = defineTool({
  name: "publish_package_template",
  description:
    "Publish a package or membership (sets isPublic=true) — the only action that makes a package visible to customers. Call this ONLY after the merchant has explicitly confirmed they want to publish. It is never a side effect of creating or editing.",
  input: { packageTemplateId: id },
  requiredPermissions: [PERMISSIONS_MAP.PACKAGE_TEMPLATE_UPDATE.code],
  sensitive: true,
  handler: (args, scope) =>
    ServiceLocator.PackageTemplateService.public.updatePackageTemplate({
      ...parseDto(UpdatePackageTemplateBodySchema, { isPublic: true }),
      packageTemplateId: args.packageTemplateId,
      merchantId: scope.merchantId,
    }),
});

export const unpublishPackageTemplate = defineTool({
  name: "unpublish_package_template",
  description:
    "Unpublish a package or membership (sets isPublic=false) — takes a live package back to DRAFT so customers can no longer see it, while keeping it in the merchant's catalog. Use to temporarily hide a published package. To remove it entirely, use archive_package_template. Call only after the merchant has explicitly confirmed.",
  input: { packageTemplateId: id },
  requiredPermissions: [PERMISSIONS_MAP.PACKAGE_TEMPLATE_UPDATE.code],
  sensitive: true,
  handler: (args, scope) =>
    ServiceLocator.PackageTemplateService.public.updatePackageTemplate({
      ...parseDto(UpdatePackageTemplateBodySchema, { isPublic: false }),
      packageTemplateId: args.packageTemplateId,
      merchantId: scope.merchantId,
    }),
});

export const archivePackageTemplate = defineTool({
  name: "archive_package_template",
  description:
    "Remove (archive) a package or membership from active listings. DESTRUCTIVE — call ONLY after the merchant has explicitly confirmed removing the specific named package.",
  input: { packageTemplateId: id },
  requiredPermissions: [PERMISSIONS_MAP.PACKAGE_TEMPLATE_UPDATE.code],
  sensitive: true,
  handler: (args) =>
    ServiceLocator.PackageTemplateService.public.archivePackageTemplate(
      args.packageTemplateId,
    ),
});
