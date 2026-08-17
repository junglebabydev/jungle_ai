import {
  CampDetails,
  LOCATION_TYPE,
  Prisma,
  Product,
  PRODUCT_TYPE,
  SG_REGIONS,
} from "@prisma/client";
import prisma from "../../config/prisma";
import { searchClient } from "../../lib/searchClient";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CampDetailsFilter,
  CampDetailsResponseDTO,
  CreateCampDTO,
  mapCampDetailsResponseDTO,
  UpdateCampDTO,
} from "../../shared/dtos/CampDetailsDTOs";
import { ICampDetailsService } from "./service.interface";
import { ServiceLocator } from "..";
import {
  buildPaginatedResponse,
  normalizePagination,
  PaginatedResponseDTO,
} from "../../shared/dtos/PaginationDTO";
import {
  PRODUCT_ORDER_BY_KEYS,
  ProductOrderByKey,
} from "../../shared/dtos/ProductDTOs";

async function createCamp(
  locationId: string | number,
  dto: CreateCampDTO,
): Promise<CampDetailsResponseDTO> {
  const { product: productDTO, campDetails: campDetailsDTO } = dto;

  try {
    const { product, campDetails } = await prisma.$transaction(async (tx) => {
      const product =
        await ServiceLocator.ProductService.internal.createProduct(
          locationId,
          productDTO,
          tx,
        );

      const campDetails = await tx.campDetails.create({
        data: {
          productId: product.id,
          categoryId: product.categoryId,
          name: campDetailsDTO.name,
          description: campDetailsDTO.description,
          venueAddress: campDetailsDTO.venueAddress,
          lat: campDetailsDTO.lat,
          long: campDetailsDTO.long,
          nearestMrt: campDetailsDTO.nearestMrt,
          requiresPackage: campDetailsDTO.requiresPackage,
          nearestBusStop: campDetailsDTO.nearestBusStop,
          mealIncluded: campDetailsDTO.mealIncluded,
          busIncluded: campDetailsDTO.busIncluded,
          discountDetails: campDetailsDTO.discountDetails,
          bookingUrl: campDetailsDTO.bookingUrl,
          notes: campDetailsDTO.notes,
          cancellationPolicy: campDetailsDTO.cancellationPolicy,
        },
      });

      return { product, campDetails };
    });

    // Index the new camp product AFTER the transaction commits (never inside
    // it — a rollback would leave a phantom doc). Non-fatal.
    void ServiceLocator.ProductService.internal.reindexForSearch(product.id);

    return mapCampDetailsResponseDTO(campDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateCampDetails;
  }
}

async function getCampDetailsById(
  id: string | number,
  {
    withProduct,
    withCategory,
    withOptions,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withOptions?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<CampDetailsResponseDTO> {
  try {
    const campDetails = await prisma.campDetails.findUnique({
      where: { id: Number(id) },
      include: _buildCampDetailsInclude({
        withProduct,
        withCategory,
        withOptions,
        withLocation,
        withMerchant,
      }),
    });
    if (!campDetails) throw NotFoundError.CampDetails;

    return mapCampDetailsResponseDTO(campDetails, {
      product: campDetails.product,
      category: campDetails.category,
      campOptions: campDetails.campOptions,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchCampDetails(`id: ${id}`);
  }
}

async function getCampDetailsByProduct(
  productId: string | number,
  {
    withProduct,
    withCategory,
    withOptions,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withOptions?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<CampDetailsResponseDTO> {
  try {
    const campDetails = await prisma.campDetails.findUnique({
      where: { productId: Number(productId) },
      include: _buildCampDetailsInclude({
        withProduct,
        withCategory,
        withOptions,
        withLocation,
        withMerchant,
      }),
    });
    if (!campDetails) throw NotFoundError.CampDetails;

    return mapCampDetailsResponseDTO(campDetails, {
      product: campDetails.product,
      category: campDetails.category,
      campOptions: campDetails.campOptions,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchCampDetails(`by productId: ${productId}`);
  }
}

async function listCamps(
  filter: CampDetailsFilter,
  {
    withProduct,
    withCategory,
    includeArchived,
    withOptions,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    includeArchived?: boolean;
    withOptions?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<PaginatedResponseDTO<CampDetailsResponseDTO, ProductOrderByKey>> {
  const {
    categoryId,
    merchantId,
    locationId,
    tags,
    age,
    region,
    locationType,
    startDate,
    search,
  } = filter;
  try {
    const meta = normalizePagination<ProductOrderByKey>(
      filter,
      PRODUCT_ORDER_BY_KEYS,
    );
    const searchTerm = search?.trim();

    // Typesense path: full-text search via the unified products index (scoped
    // to productType CAMP), then
    // hydrate camp rows from the DB (re-applying the archived guard) in
    // relevance order. `startDate` filters campOptions — a relation the product
    // index doesn't model — so when it's present we use the DB path for
    // correctness. On any Typesense error we fall through to the DB search.
    if (searchTerm && searchTerm.length > 0 && !startDate) {
      let searchResult: { ids: string[]; total: number } | null = null;
      try {
        searchResult = await searchClient.searchIds("products", {
          q: searchTerm,
          page: meta.page,
          pageSize: meta.pageSize,
          filter: {
            productType: PRODUCT_TYPE.CAMP,
            categoryId,
            merchantId,
            locationId,
            tags,
            region,
            locationType,
            age,
            includeArchived: Boolean(includeArchived),
          },
        });
      } catch (e) {
        console.warn(
          `[typesense] camp search unavailable, falling back to DB: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }

      if (searchResult) {
        const productIds = searchResult.ids
          .map((sid) => Number(sid))
          .filter((n) => Number.isFinite(n));

        const rows = productIds.length
          ? await prisma.campDetails.findMany({
              where: {
                productId: { in: productIds },
                ...(includeArchived ? {} : { product: { isArchived: false } }),
              },
              include: _buildCampDetailsInclude({
                withProduct,
                withCategory,
                withOptions,
                withLocation,
                withMerchant,
              }),
            })
          : [];

        // Preserve Typesense relevance ordering (findMany doesn't guarantee it).
        const byProductId = new Map(rows.map((r) => [r.productId, r]));
        const ordered = productIds
          .map((pid) => byProductId.get(pid))
          .filter((c): c is (typeof rows)[number] => Boolean(c));

        const mapped = ordered.map((camp) =>
          mapCampDetailsResponseDTO(camp, {
            product: camp.product,
            category: camp.category,
            campOptions: camp.campOptions,
          }),
        );

        // Relevance-ranked, not field-sorted — don't claim an orderBy.
        return buildPaginatedResponse<CampDetailsResponseDTO, ProductOrderByKey>(
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

    const where: Prisma.CampDetailsWhereInput = {
      product: {
        isArchived: false,
      },
    };
    if (includeArchived) delete where.product;

    const andClauses: Prisma.CampDetailsWhereInput[] = [];

    if (categoryId) andClauses.push({ categoryId: Number(categoryId) });

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
        campOptions: {
          some: {
            startDate: {
              gte: startDate,
            },
          },
        },
      });
    }

    if (search && search.trim().length > 0) {
      andClauses.push({
        OR: [
          { product: { name: { contains: search, mode: "insensitive" } } },
          {
            product: { description: { contains: search, mode: "insensitive" } },
          },
          { category: { name: { contains: search, mode: "insensitive" } } },
          {
            product: {
              location: { name: { contains: search, mode: "insensitive" } },
            },
          },
          {
            product: {
              location: {
                merchant: { name: { contains: search, mode: "insensitive" } },
              },
            },
          },
        ],
      });
    }

    if (andClauses.length > 0) where.AND = andClauses;

    const orderBy = meta.orderBy
      ? ({
          [meta.orderBy]: meta.order,
        } as Prisma.ProductOrderByWithRelationInput)
      : undefined;

    const [data, total] = await prisma.$transaction([
      prisma.campDetails.findMany({
        where,
        include: _buildCampDetailsInclude({
          withProduct,
          withCategory,
          withOptions,
          withLocation,
          withMerchant,
        }),
        orderBy: {
          product: orderBy,
        },
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.campDetails.count({ where }),
    ]);

    const mapped = data.map((camp) =>
      mapCampDetailsResponseDTO(camp, {
        product: camp.product,
        category: camp.category,
        campOptions: camp.campOptions,
      }),
    );

    return buildPaginatedResponse<CampDetailsResponseDTO, ProductOrderByKey>(
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
    throw BadRequestError.FetchCampDetails();
  }
}

async function updateCamp(
  id: string | number,
  productId: string | number,
  dto: UpdateCampDTO,
): Promise<CampDetailsResponseDTO> {
  const { product: productDTO, campDetails: campDetailsDTO } = dto;

  try {
    const { product, campDetails } = await prisma.$transaction(async (tx) => {
      let updatedProduct: Product | undefined;
      let updatedCampDetails: CampDetails | undefined;

      if (productDTO) {
        updatedProduct =
          await ServiceLocator.ProductService.internal.updateProduct(
            productId,
            productDTO,
            tx,
          );
      }

      const existing = await tx.campDetails.findUnique({
        where: { id: Number(id), productId: Number(productId) },
      });
      if (!existing) throw NotFoundError.CampDetails;

      if (campDetailsDTO) {
        updatedCampDetails = await tx.campDetails.update({
          where: { id: existing.id },
          data: {
            categoryId: updatedProduct?.categoryId ?? existing.categoryId,
            name: campDetailsDTO.name ?? existing.name,
            description: campDetailsDTO.description ?? existing.description,
            venueAddress: campDetailsDTO.venueAddress ?? existing.venueAddress,
            lat: campDetailsDTO.lat ?? existing.lat,
            long: campDetailsDTO.long ?? existing.long,
            nearestMrt: campDetailsDTO.nearestMrt ?? existing.nearestMrt,
            requiresPackage:
              campDetailsDTO.requiresPackage ?? existing.requiresPackage,
            nearestBusStop:
              campDetailsDTO.nearestBusStop ?? existing.nearestBusStop,
            mealIncluded: campDetailsDTO.mealIncluded ?? existing.mealIncluded,
            busIncluded: campDetailsDTO.busIncluded ?? existing.busIncluded,
            discountDetails:
              campDetailsDTO.discountDetails ?? existing.discountDetails,
            bookingUrl: campDetailsDTO.bookingUrl ?? existing.bookingUrl,
            notes: campDetailsDTO.notes ?? existing.notes,
            cancellationPolicy:
              campDetailsDTO.cancellationPolicy ?? existing.cancellationPolicy,
          },
        });
      }

      return {
        product: updatedProduct,
        campDetails: updatedCampDetails ?? existing,
      };
    });

    // Refresh the search index after commit (idempotent; covers product-field
    // changes that affect the doc). Non-fatal.
    void ServiceLocator.ProductService.internal.reindexForSearch(productId);

    return mapCampDetailsResponseDTO(campDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateCampDetails;
  }
}

export const CampDetailsService: ICampDetailsService = {
  createCamp,
  getCampDetailsById,
  getCampDetailsByProduct,
  listCamps,
  updateCamp,
};

function _buildCampDetailsInclude(args: {
  withCategory?: boolean;
  withProduct?: boolean;
  withLocation?: boolean;
  withMerchant?: boolean;
  withOptions?: boolean;
}): Prisma.CampDetailsInclude {
  const { withCategory, withProduct, withLocation, withMerchant, withOptions } =
    args;

  return {
    category: withCategory,
    product: withProduct
      ? {
          include: {
            ...(withLocation
              ? {
                  location: {
                    include: {
                      ...(withMerchant ? { merchant: true } : {}),
                    },
                  },
                }
              : {}),
          },
        }
      : false,
    campOptions: withOptions,
  };
}
