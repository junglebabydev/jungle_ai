import { LOCATION_TYPE, Prisma, SG_REGIONS } from "@prisma/client";
import { IMerchantService } from "./service.interafce";
import prisma from "../../config/prisma";
import { ServiceLocator } from "../../services";
import { searchClient } from "../../lib/searchClient";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CreateMerchantDTO,
  mapMerchantResponseDTO,
  MERCHANT_ORDER_BY_KEYS,
  MerchantFilter,
  MerchantOrderKey,
  MerchantResonseDTO,
  UpdateMerchantDTO,
} from "../../shared/dtos/MerchantDTOs";
import {
  MERCHANT_SEARCH_INCLUDE,
  MerchantWithLocations,
} from "../../shared/types/merchant";
import {
  buildPaginatedResponse,
  normalizePagination,
  PaginatedResponseDTO,
} from "../../shared/dtos/PaginationDTO";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function createMerchant(
  dto: CreateMerchantDTO,
): Promise<MerchantResonseDTO> {
  try {
    const merchant = await prisma.merchant.create({
      data: {
        name: dto.name,
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail || null,
        webUrl: dto.webUrl || null,
        logoUrl: dto.logoUrl || null,
        brandColor: dto.brandColor ?? null,
        businessRegistration: dto.businessRegistration ?? null,
        gstNumber: dto.gstNumber ?? null,
        gstRegistered: dto.gstRegistered ?? false,
        isActive: dto.isActive,
        isVerified: dto.isVerified,
        isArchived: dto.isArchived,
        verifiedAt: dto.isVerified ? new Date() : undefined,
      },
      include: MERCHANT_SEARCH_INCLUDE,
    });

    // Index in the background — never block or fail the write on the search engine.
    void searchClient.reindex("merchants", merchant.id);

    return mapMerchantResponseDTO(merchant, {});
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateMerchant;
  }
}

async function getMerchantById(
  id: string | number,
  { withLocations }: { withLocations?: boolean },
): Promise<MerchantResonseDTO> {
  const merchant = await _getById(id, { withLocations });

  const locations = withLocations
    ? merchant.locations?.filter((l) => !l.isArchived)
    : undefined;

  return mapMerchantResponseDTO(merchant, { locations });
}

async function listMerchants(
  filter: MerchantFilter,
  {
    withLocations,
    withLocationDetails,
    withLocationOperatingHrs,
    includeArchived,
  }: {
    withLocations?: boolean;
    withLocationDetails?: boolean;
    withLocationOperatingHrs?: boolean;
    includeArchived?: boolean;
  } = {},
): Promise<PaginatedResponseDTO<MerchantResonseDTO, MerchantOrderKey>> {
  try {
    // Pagination and ordering
    const meta = normalizePagination<MerchantOrderKey>(
      filter,
      MERCHANT_ORDER_BY_KEYS,
    );

    const searchTerm = filter.search?.trim();
    const { isVerified, region, locationType, category, categoryId, tags } =
      filter;

    const locationsInclude = withLocations
      ? {
          include: {
            details: withLocationDetails || undefined,
            operatingHrs: withLocationOperatingHrs || undefined,
          },
        }
      : false;

    // Search path: when a TEXT query is present, resolve matching ids via
    // Typesense (relevance-ranked), then hydrate the rows from Postgres. A
    // filter-only / browse request uses the DB path below. On any Typesense
    // error we fall through to the DB path. (Mirrors listCamps.)
    if (searchTerm) {
      let searchResult: { ids: string[]; total: number } | null = null;
      try {
        // The FE always sends orderBy=createdAt, but a text search must rank by
        // relevance (best match first) — override to pure `_text_match`. The
        // filter-only/browse path (DB) honors orderBy normally.
        searchResult = await searchClient.searchIds("merchants", {
          q: searchTerm,
          page: meta.page,
          pageSize: meta.pageSize,
          sortBy: "_text_match:desc",
          filter: {
            includeArchived: Boolean(includeArchived),
            isVerified,
            region,
            locationType,
            category,
            categoryId,
            tags,
          },
        });
      } catch (e) {
        console.warn(
          `[typesense] merchant search unavailable, falling back to DB: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }

      if (searchResult) {
        const numericIds = searchResult.ids
          .map((sid) => Number(sid))
          .filter((n) => Number.isFinite(n));

        const rows = numericIds.length
          ? await prisma.merchant.findMany({
              // Re-apply the archived guard so a drifted index (archived in DB,
              // stale in Typesense) can never leak an archived merchant.
              where: {
                id: { in: numericIds },
                ...(includeArchived ? {} : { isArchived: false }),
              },
              include: { locations: locationsInclude },
            })
          : [];

        // Preserve Typesense relevance ordering (findMany doesn't guarantee it).
        const byId = new Map(rows.map((r) => [r.id, r]));
        const ordered = numericIds
          .map((nid) => byId.get(nid))
          .filter((m): m is (typeof rows)[number] => Boolean(m));

        const mapped = ordered.map((merchant) =>
          mapMerchantResponseDTO(merchant, {
            locations: merchant.locations?.filter((l) => !l.isArchived),
          }),
        );

        // Relevance-ranked, not field-sorted — don't claim an orderBy.
        return buildPaginatedResponse<MerchantResonseDTO, MerchantOrderKey>(
          mapped,
          searchResult.total,
          {
            page: meta.page,
            pageSize: meta.pageSize,
            order: meta.order,
            orderBy: undefined,
          },
        );
      }
    }

    let where: Prisma.MerchantWhereInput = {
      isArchived: false,
    };
    if (includeArchived) delete where.isArchived;

    if (searchTerm)
      where.name = {
        contains: searchTerm,
        mode: "insensitive",
      };

    // Mirror the structured filters from the Typesense path so filtering works
    // on the DB fallback (and for filter-only browsing without a search term).
    // The child clauses mirror the Typesense path, which denormalizes only
    // NON-archived locations/categories — so each `some` re-applies
    // `isArchived: false`, otherwise an archived child could match here but not
    // in the index (the two paths must return the same set).
    const andClauses: Prisma.MerchantWhereInput[] = [];
    if (isVerified !== undefined) andClauses.push({ isVerified });
    if (region)
      andClauses.push({
        locations: {
          some: {
            isArchived: false,
            sgRegion: Array.isArray(region)
              ? { in: region as SG_REGIONS[] }
              : (region as SG_REGIONS),
          },
        },
      });
    if (locationType)
      andClauses.push({
        locations: {
          some: { isArchived: false, locationType: locationType as LOCATION_TYPE },
        },
      });
    if (category)
      andClauses.push({
        productCategories: { some: { isArchived: false, name: category } },
      });
    if (categoryId && categoryId.length > 0)
      andClauses.push({
        productCategories: { some: { isArchived: false, id: { in: categoryId } } },
      });
    if (tags && tags.length > 0)
      // hasSome semantics on location tags (the doc indexes location tags only).
      andClauses.push({
        locations: { some: { isArchived: false, tags: { hasSome: tags } } },
      });
    if (andClauses.length > 0) where.AND = andClauses;

    const orderBy = meta.orderBy
      ? ({
          [meta.orderBy]: meta.order,
        } as Prisma.MerchantOrderByWithRelationInput)
      : undefined;

    const [data, total] = await prisma.$transaction([
      prisma.merchant.findMany({
        where,
        include: {
          locations: locationsInclude,
        },
        orderBy,
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.merchant.count({ where }),
    ]);

    const mapped = data.map((merchant) =>
      mapMerchantResponseDTO(merchant, {
        locations: merchant.locations?.filter((l) => !l.isArchived),
      }),
    );

    return buildPaginatedResponse<MerchantResonseDTO, MerchantOrderKey>(
      mapped,
      total,
      {
        page: meta.page,
        pageSize: meta.pageSize,
        order: meta.order,
        orderBy: meta.orderBy,
      },
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchMerchant;
  }
}

async function updateMerchant(
  id: string | number,
  dto: UpdateMerchantDTO,
): Promise<MerchantResonseDTO> {
  try {
    // First verify the merchant exists
    await _getById(id, { withLocations: false });

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.webUrl !== undefined) updateData.webUrl = dto.webUrl || null;
    if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl || null;
    if (dto.brandColor !== undefined)
      updateData.brandColor = dto.brandColor || null;
    if (dto.businessRegistration !== undefined)
      updateData.businessRegistration = dto.businessRegistration || null;
    if (dto.contactEmail !== undefined)
      updateData.contactEmail = dto.contactEmail || null;
    if (dto.contactPhone !== undefined)
      updateData.contactPhone = dto.contactPhone || null;
    if (dto.gstNumber !== undefined)
      updateData.gstNumber = dto.gstNumber || null;
    if (dto.gstRegistered !== undefined)
      updateData.gstRegistered = dto.gstRegistered;

    updateData.updatedAt = new Date();

    const merchant = await prisma.merchant.update({
      where: {
        id: Number(id),
      },
      data: updateData,
      include: MERCHANT_SEARCH_INCLUDE,
    });

    void searchClient.reindex("merchants", merchant.id);
    // merchantName / merchantCategories are denormalized into every product doc,
    // so a merchant edit must also reindex the merchant's products. Fire-and-
    // forget; the periodic reconcile is the backstop.
    void ServiceLocator.ProductService.internal.reindexProductsForMerchant(
      merchant.id,
    );

    return mapMerchantResponseDTO(merchant, {});
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateMerchant;
  }
}

async function archiveMerchant(
  id: string | number,
): Promise<MerchantResonseDTO> {
  try {
    await _getById(id, { withLocations: false });

    const merchant = await prisma.merchant.update({
      where: { id: Number(id) },
      data: { isArchived: true, updatedAt: new Date() },
      include: MERCHANT_SEARCH_INCLUDE,
    });

    // Re-index with isArchived=true so it drops out of default search but
    // remains findable when archived results are explicitly requested.
    void searchClient.reindex("merchants", merchant.id);
    // Its products denormalize the merchant, so reindex them too.
    void ServiceLocator.ProductService.internal.reindexProductsForMerchant(
      merchant.id,
    );

    return mapMerchantResponseDTO(merchant, {});
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateMerchant;
  }
}

//////////////////////////////
// Exports
//////////////////////////////

export const MerchantService: IMerchantService = {
  createMerchant,
  getMerchantById,
  listMerchants,
  updateMerchant,
  archiveMerchant,
};

//////////////////////////////
// Helper Methods
//////////////////////////////

async function _findById(
  id: string | number,
  { withLocations }: { withLocations?: boolean },
): Promise<MerchantWithLocations | null> {
  return await prisma.merchant.findUnique({
    where: {
      id: Number(id),
    },
    include: {
      locations: withLocations,
    },
  });
}

async function _getById(
  id: string | number,
  { withLocations }: { withLocations?: boolean },
): Promise<MerchantWithLocations> {
  try {
    const merchant = await _findById(id, { withLocations });
    if (!merchant) throw NotFoundError.Merchant;

    return merchant;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchMerchant;
  }
}
