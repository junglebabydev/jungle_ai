import { PackageTemplate, Prisma } from "@prisma/client";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { UpdatePackageTemplateInternalDTO } from "../../shared/dtos/PackageTemplateDTOs";
import { IPackageTemplateServiceInternal } from "./service.interface";
import { searchClient } from "../../lib/searchClient";

async function getPackageTemplateById(
  id: string | number,
  tx?: Prisma.TransactionClient
): Promise<PackageTemplate> {
  const db = tx ?? prisma;

  try {
    const packageTemplate = await db.packageTemplate.findUnique({
      where: { id: Number(id) },
    });
    if (!packageTemplate) throw NotFoundError.PackageTemplate;

    return packageTemplate;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchPackageTemplate(`id: ${id}`);
  }
}

async function updatePackageTemplate(
  dto: UpdatePackageTemplateInternalDTO,
  tx?: Prisma.TransactionClient
): Promise<PackageTemplate> {
  const db = tx ?? prisma;

  try {
    // Verify package template exists
    await getPackageTemplateById(dto.packageTemplateId, tx);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.kind !== undefined) updateData.kind = dto.kind;
    if (dto.creditsIncluded !== undefined)
      updateData.creditsIncluded = dto.creditsIncluded;
    if (dto.billingPeriodMonths !== undefined)
      updateData.billingPeriodMonths = dto.billingPeriodMonths;
    if (dto.validityDays !== undefined)
      updateData.validityDays = dto.validityDays;
    if (dto.canShareSiblings !== undefined)
      updateData.canShareSiblings = dto.canShareSiblings;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.thumbnailUrl !== undefined)
      updateData.thumbnailUrl = dto.thumbnailUrl;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;

    const packageTemplate = await db.packageTemplate.update({
      where: { id: dto.packageTemplateId },
      data: updateData,
    });

    return packageTemplate;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdatePackageTemplate;
  }
}

async function updateStripePriceId(
  id: string | number,
  stripePriceId: string,
  tx?: Prisma.TransactionClient
): Promise<PackageTemplate> {
  const db = tx ?? prisma;

  try {
    return await db.packageTemplate.update({
      where: { id: Number(id) },
      data: { stripePriceId },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdatePackageTemplate;
  }
}

/**
 * Reindex a package template's search doc after its row changes. Fire-and-forget,
 * non-fatal — a search failure must never break the write; the reconcile is the backstop.
 */
async function reindexForSearch(id: string | number): Promise<void> {
  await searchClient.reindex("packages", id);
}

export const PackageTemplateServiceInternal: IPackageTemplateServiceInternal = {
  getPackageTemplateById,
  updatePackageTemplate,
  updateStripePriceId,
  reindexForSearch,
};
