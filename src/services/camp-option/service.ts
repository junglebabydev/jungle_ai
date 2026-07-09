import {
  CampOption,
  LOCATION_TYPE,
  PRICE_TYPE,
  Prisma,
  SG_REGIONS,
} from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CampOptionFilter,
  CampOptionResponseDTO,
  CreateCampOptionDTO,
  mapCampOptionResponseDTO,
  UpdateCampOptionDTO,
} from "../../shared/dtos/CampOptionDTOs";
import { ICampOptionService } from "./service.interface";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  buildPaginatedResponse,
  normalizePagination,
  PaginatedResponseDTO,
} from "../../shared/dtos/PaginationDTO";
import {
  PRODUCT_ORDER_BY_KEYS,
  ProductOrderByKey,
} from "../../shared/dtos/ProductDTOs";
import { ServiceLocator } from "..";

async function createCampOption(
  dto: CreateCampOptionDTO,
): Promise<CampOptionResponseDTO> {
  try {
    const campDetails =
      await ServiceLocator.CampDetailsService.public.getCampDetailsByProduct(
        dto.productId,
        {},
      );

    const campOption = await prisma.campOption.create({
      data: {
        campDetailsId: campDetails.id,
        productId: dto.productId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        capacity: dto.capacity,
        isAvailable: dto.isAvailable,
        price: dto.price,
        priceType: dto.priceType as PRICE_TYPE,
        isArchived: dto.isArchived,
      },
    });

    // A camp's availability cutoff (`latestCampOptionEndAt`) in the search index
    // is derived from its options, so a new option must reindex the parent
    // product. Fire-and-forget, non-fatal — the periodic reconcile is the
    // backstop and a search hiccup must never fail the write.
    void ServiceLocator.ProductService.internal.reindexForSearch(dto.productId);

    return mapCampOptionResponseDTO(campOption);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateCampOption;
  }
}

async function getCampOptionById(
  id: string | number,
  { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean } = {},
): Promise<CampOptionResponseDTO> {
  try {
    const campOption = await prisma.campOption.findUnique({
      where: { id: Number(id) },
      include: {
        product: withProduct,
        campDetails: withCamp,
      },
    });
    if (!campOption) throw NotFoundError.CampOption;

    return mapCampOptionResponseDTO(campOption, {
      product: campOption.product,
      camp: campOption.campDetails,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchCampOption(`id: ${id}`);
  }
}

async function getCampOptionByProduct(
  productId: string | number,
  { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean } = {},
): Promise<CampOptionResponseDTO> {
  try {
    const campOption = await prisma.campOption.findFirst({
      where: { productId: Number(productId) },
      include: {
        product: withProduct,
        campDetails: withCamp,
      },
    });
    if (!campOption) throw NotFoundError.CampOption;

    return mapCampOptionResponseDTO(campOption, {
      product: campOption.product,
      camp: campOption.campDetails,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchCampOption(`productId: ${productId}`);
  }
}

async function listCampOptions(
  filter: CampOptionFilter,
  { withProduct, withCamp }: { withProduct?: boolean; withCamp?: boolean } = {},
): Promise<PaginatedResponseDTO<CampOptionResponseDTO, ProductOrderByKey>> {
  const {
    campId,
    productId,
    categoryId,
    merchantId,
    locationId,
    tags,
    region,
    age,
    locationType,
    startDate,
  } = filter;
  try {
    const where: Prisma.CampOptionWhereInput = {};
    const andClauses: Prisma.CampOptionWhereInput[] = [];

    if (campId)
      andClauses.push({ product: { campDetails: { id: Number(campId) } } });
    if (productId) andClauses.push({ productId: Number(productId) });
    if (categoryId)
      andClauses.push({ product: { categoryId: Number(categoryId) } });
    if (merchantId)
      andClauses.push({
        product: { location: { merchantId: Number(merchantId) } },
      });
    if (locationId)
      andClauses.push({ product: { locationId: Number(locationId) } });

    if (tags && tags.length > 0) {
      andClauses.push({
        product: {
          OR: [
            {
              tags: {
                hasSome: tags,
              },
            },
            {
              location: {
                tags: {
                  hasSome: tags,
                },
              },
            },
          ],
        },
      });
    }

    if (region)
      andClauses.push({
        product: {
          location: {
            sgRegion: region as SG_REGIONS,
          },
        },
      });

    if (age) {
      andClauses.push({
        product: {
          AND: [
            {
              OR: [{ ageMin: undefined }, { ageMin: { lte: age } }],
            },
            {
              OR: [{ ageMax: undefined }, { ageMax: { gte: age } }],
            },
          ],
        },
      });
    }

    if (locationType) {
      andClauses.push({
        product: {
          location: {
            locationType: locationType as LOCATION_TYPE,
          },
        },
      });
    }

    if (startDate) {
      andClauses.push({
        startDate: {
          gte: startDate,
        },
      });
    }

    if (andClauses.length > 0) where.AND = andClauses;

    // Pagination and ordering
    const meta = normalizePagination<ProductOrderByKey>(
      filter,
      PRODUCT_ORDER_BY_KEYS,
    );
    const orderBy = meta.orderBy
      ? ({
          [meta.orderBy]: meta.order,
        } as Prisma.ProductOrderByWithRelationInput)
      : undefined;

    const [data, total] = await prisma.$transaction([
      prisma.campOption.findMany({
        where,
        include: {
          product: withProduct,
          campDetails: withCamp,
        },
        orderBy: {
          product: orderBy,
        },
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.campOption.count({ where }),
    ]);

    const mapped = data.map((campOption) =>
      mapCampOptionResponseDTO(campOption, {
        product: campOption.product,
        camp: campOption.campDetails,
      }),
    );

    return buildPaginatedResponse<CampOptionResponseDTO, ProductOrderByKey>(
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
    throw BadRequestError.FetchCampOption(`campId: ${campId}`);
  }
}

async function updateCampOption(
  id: string | number,
  productId: string | number,
  dto: UpdateCampOptionDTO,
): Promise<CampOptionResponseDTO> {
  try {
    const existing = await prisma.campOption.findUnique({
      where: { id: Number(id), productId: Number(productId) },
    });
    if (!existing) throw NotFoundError.CampOption;

    const updated = await prisma.campOption.update({
      where: { id: Number(id) },
      data: {
        name: dto.name ?? existing.name,
        startDate: dto.startDate ?? existing.startDate,
        endDate: dto.endDate ?? existing.endDate,
        startTime: dto.startTime ?? existing.startTime,
        endTime: dto.endTime ?? existing.endTime,
        ageMin: dto.ageMin ?? existing.ageMin,
        ageMax: dto.ageMax ?? existing.ageMax,
        capacity: dto.capacity ?? existing.capacity,
        isAvailable: dto.isAvailable ?? existing.isAvailable,
        price: dto.price ?? existing.price,
        priceType: (dto.priceType as PRICE_TYPE) ?? existing.priceType,
        isArchived: dto.isArchived ?? existing.isArchived,
      },
    });

    // Date / availability / archive changes shift the camp's availability cutoff
    // in the search index, so reindex the parent product. Fire-and-forget,
    // non-fatal (see createCampOption).
    void ServiceLocator.ProductService.internal.reindexForSearch(
      Number(productId),
    );

    return mapCampOptionResponseDTO(updated);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateCampOption;
  }
}

export const CampOptionService: ICampOptionService = {
  createCampOption,
  getCampOptionById,
  getCampOptionByProduct,
  listCampOptions,
  updateCampOption,
};
