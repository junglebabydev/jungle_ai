import { PACKAGE_KIND } from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreatePackageTemplateDTO,
  mapPackageTemplateResponseDTO,
  PackageTemplateFilter,
  PackageTemplateResponseDTO,
  UpdatePackageTemplateDTO,
} from "../../shared/dtos/PackageTemplateDTOs";
import { IPackageTemplateService } from "./service.interface";
import { PackageTemplateServiceInternal } from "./service.internal";
import { ServiceLocator } from "..";
import { AuthError } from "../../errors/domains/AuthError";
import { LocationUserWithRole } from "../../shared/types/location-user";
import { MerchantUserWithRole } from "../../shared/types/merchant-user";

async function createPackageTemplate(
  userId: string | number,
  dto: CreatePackageTemplateDTO,
): Promise<PackageTemplateResponseDTO> {
  let merchantUser: MerchantUserWithRole | null = null;
  let locationUser: LocationUserWithRole | null = null;

  try {
    // Super admin bypasses ownership check
    const user = await ServiceLocator.UserService.internal.getUserById(userId, {
      withRole: true,
    });
    if (!user) throw BadRequestError.FetchUser;
    const isSuperAdmin = user.platformRole.name === "SUPER_ADMIN";
    if (!isSuperAdmin) {
      merchantUser =
        await ServiceLocator.MerchantUserService.internal.getMerchantUserByUserIdMerchantId(
          userId,
          dto.merchantId,
          {},
        );

      if (dto.locationId)
        locationUser =
          await ServiceLocator.LocationUserService.internal.getLocationUserByUserIdAndLocationId(
            userId,
            dto.locationId,
            {},
          );

      if (!merchantUser && !locationUser) throw AuthError.AccessDenied;
    }
    const packageTemplate = await prisma.packageTemplate.create({
      data: {
        merchantId: dto.merchantId,
        locationId: dto.locationId,
        productId: dto.productId,
        name: dto.name,
        kind: dto.kind as PACKAGE_KIND,
        creditsIncluded: dto.creditsIncluded,
        billingPeriodMonths: dto.billingPeriodMonths,
        validityDays: dto.validityDays,
        canShareSiblings: dto.canShareSiblings,
        price: dto.price,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        isPublic: dto.isPublic,
      },
    });

    // Package templates are their own search collection, so a new template must
    // reindex its doc. Fire-and-forget; the periodic reconcile is the backstop.
    void PackageTemplateServiceInternal.reindexForSearch(packageTemplate.id);

    return mapPackageTemplateResponseDTO(packageTemplate);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreatePackageTemplate;
  }
}

async function getPackageTemplateById(
  id: string | number,
  {
    withMerchant,
    withLocation,
    withProduct,
  }: {
    withMerchant?: boolean;
    withLocation?: boolean;
    withProduct?: boolean;
  } = {},
): Promise<PackageTemplateResponseDTO> {
  try {
    const packageTemplate = await prisma.packageTemplate.findUnique({
      where: { id: Number(id) },
      include: {
        merchant: withMerchant,
        location: withLocation,
        product: withProduct,
      },
    });
    if (!packageTemplate) throw NotFoundError.PackageTemplate;

    return mapPackageTemplateResponseDTO(packageTemplate, {
      merchant: packageTemplate.merchant,
      location: packageTemplate.location,
      product: packageTemplate.product,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(`id: ${id}`);
  }
}

async function listPackageTemplatesByProduct(
  productId: string | number,
  {
    withMerchant,
    withLocation,
    withProduct,
  }: {
    withMerchant?: boolean;
    withLocation?: boolean;
    withProduct?: boolean;
  } = {},
): Promise<PackageTemplateResponseDTO[]> {
  try {
    const packageTemplates = await prisma.packageTemplate.findMany({
      where: {
        productId: Number(productId),
      },
      include: {
        merchant: withMerchant,
        location: withLocation,
        product: withProduct,
      },
    });

    return packageTemplates.map((packageTemplate) =>
      mapPackageTemplateResponseDTO(packageTemplate, {
        merchant: packageTemplate.merchant,
        location: packageTemplate.location,
        product: packageTemplate.product,
      }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(`productId: ${productId}`);
  }
}

async function listPackageTemplatesByLocation(
  locationId: string | number,
  {
    withMerchant,
    withLocation,
    withProduct,
  }: {
    withMerchant?: boolean;
    withLocation?: boolean;
    withProduct?: boolean;
  } = {},
): Promise<PackageTemplateResponseDTO[]> {
  try {
    const packageTemplates = await prisma.packageTemplate.findMany({
      where: {
        locationId: Number(locationId),
      },
      include: {
        merchant: withMerchant,
        location: withLocation,
        product: withProduct,
      },
    });

    return packageTemplates.map((packageTemplate) =>
      mapPackageTemplateResponseDTO(packageTemplate, {
        merchant: packageTemplate.merchant,
        location: packageTemplate.location,
        product: packageTemplate.product,
      }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(`locationId: ${locationId}`);
  }
}

async function listPackageTemplatesByMerchant(
  merchantId: string | number,
  {
    withMerchant,
    withLocation,
    withProduct,
  }: {
    withMerchant?: boolean;
    withLocation?: boolean;
    withProduct?: boolean;
  } = {},
): Promise<PackageTemplateResponseDTO[]> {
  try {
    const packageTemplates = await prisma.packageTemplate.findMany({
      where: {
        merchantId: Number(merchantId),
      },
      include: {
        merchant: withMerchant,
        location: withLocation,
        product: withProduct,
      },
    });

    return packageTemplates.map((packageTemplate) =>
      mapPackageTemplateResponseDTO(packageTemplate, {
        merchant: packageTemplate.merchant,
        location: packageTemplate.location,
        product: packageTemplate.product,
      }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(`merchantId: ${merchantId}`);
  }
}

async function updatePackageTemplate(
  dto: UpdatePackageTemplateDTO,
): Promise<PackageTemplateResponseDTO> {
  try {
    const {
      merchantId,
      locationId,
      productId,
      packageTemplateId,
      ...updateData
    } = dto;

    await PackageTemplateServiceInternal.getPackageTemplateById(
      packageTemplateId,
    );

    const packageTemplate =
      await PackageTemplateServiceInternal.updatePackageTemplate({
        packageTemplateId,
        ...updateData,
        kind: updateData.kind as PACKAGE_KIND | undefined,
      });

    // A template change shifts its search doc, so reindex it. Fire-and-forget;
    // reconcile backstop.
    void PackageTemplateServiceInternal.reindexForSearch(packageTemplateId);

    return getPackageTemplateById(packageTemplateId, {
      withMerchant: true,
      withLocation: true,
      withProduct: true,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdatePackageTemplate;
  }
}

async function listPublicPackageTemplates(
  filter: PackageTemplateFilter,
  {
    withMerchant,
    withLocation,
    withProduct,
  }: {
    withMerchant?: boolean;
    withLocation?: boolean;
    withProduct?: boolean;
  } = {},
): Promise<PackageTemplateResponseDTO[]> {
  try {
    const packageTemplates = await prisma.packageTemplate.findMany({
      where: {
        isPublic: true,
        isArchived: false,
        ...(filter.kind ? { kind: filter.kind as PACKAGE_KIND } : {}),
      },
      include: {
        merchant: withMerchant,
        location: withLocation,
        product: withProduct,
      },
    });

    return packageTemplates.map((packageTemplate) =>
      mapPackageTemplateResponseDTO(packageTemplate, {
        merchant: packageTemplate.merchant,
        location: packageTemplate.location,
        product: packageTemplate.product,
      }),
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(
      `public list filter: ${JSON.stringify(filter)}`,
    );
  }
}

async function archivePackageTemplate(
  id: string | number,
): Promise<PackageTemplateResponseDTO> {
  try {
    // Verify package template exists
    await PackageTemplateServiceInternal.getPackageTemplateById(id);

    const packageTemplate = await prisma.packageTemplate.update({
      where: { id: Number(id) },
      data: {
        isArchived: true,
      },
    });

    // Archiving drops the template from its search collection, so reindex its
    // doc. Fire-and-forget; reconcile backstop.
    void PackageTemplateServiceInternal.reindexForSearch(packageTemplate.id);

    return mapPackageTemplateResponseDTO(packageTemplate);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.ArchivePackageTemplate;
  }
}

export const PackageTemplateService: IPackageTemplateService = {
  createPackageTemplate,
  getPackageTemplateById,
  listPackageTemplatesByProduct,
  listPackageTemplatesByMerchant,
  listPackageTemplatesByLocation,
  listPublicPackageTemplates,
  updatePackageTemplate,
  archivePackageTemplate,
};
