import {
  DropInDetails,
  LOCATION_TYPE,
  Prisma,
  Product,
  SG_REGIONS,
} from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreateDropInDTO,
  DropInDetailsFilter,
  DropInDetailsResponseDTO,
  mapDropInDetailsResponseDTO,
  UpdateDropInDTO,
} from "../../shared/dtos/DropInDetailsDTOs";
import { IDropInDetailsService } from "./service.interface";
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

async function createDropIn(
  locationId: number,
  dto: CreateDropInDTO,
): Promise<DropInDetailsResponseDTO> {
  const { product: productDTO, dropInDetails: dropInDetailsDTO } = dto;

  try {
    const { product, dropInDetails } = await prisma.$transaction(async (tx) => {
      const product =
        await ServiceLocator.ProductService.internal.createProduct(
          locationId,
          productDTO,
          tx,
        );

      const dropInDetails = await tx.dropInDetails.create({
        data: {
          productId: product.id,
          categoryId: product.categoryId,
          minKids: dropInDetailsDTO.minKids,
          maxKids: dropInDetailsDTO.maxKids,
          minParents: dropInDetailsDTO.minParents,
          maxParents: dropInDetailsDTO.maxParents,
          whatsIncluded: dropInDetailsDTO.whatsIncluded,
          cancellationPolicy: dropInDetailsDTO.cancellationPolicy,
          requiresPackage: dropInDetailsDTO.requiresPackage,
          notes: dropInDetailsDTO.notes,
          bookingUrl: dropInDetailsDTO.bookingUrl,
        },
      });

      return { product, dropInDetails };
    });

    // Reindex the new product post-commit so it enters the search index. Fire-
    // and-forget; the periodic reconcile is the backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(product.id);

    return mapDropInDetailsResponseDTO(dropInDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateDropInDetails;
  }
}

async function getDropInDetailsById(
  id: string | number,
  {
    withProduct,
    withCategory,
    withSchedules,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withSchedules?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<DropInDetailsResponseDTO> {
  try {
    const dropIn = await prisma.dropInDetails.findUnique({
      where: {
        id: Number(id),
      },
      include: _buildDropInDetailsInclude({
        withCategory,
        withProduct,
        withLocation,
        withMerchant,
        withSchedules,
      }),
    });
    if (!dropIn) throw NotFoundError.DropIn;

    return mapDropInDetailsResponseDTO(dropIn, {
      product: dropIn.product,
      category: dropIn.category,
      schedules: dropIn.dropInSchedules,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchDropInDetails(`id: ${id}`);
  }
}

async function getDropInDetailsByProduct(
  productId: string | number,
  {
    withProduct,
    withCategory,
    withSchedules,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withSchedules?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<DropInDetailsResponseDTO> {
  try {
    const dropIn = await prisma.dropInDetails.findUnique({
      where: {
        productId: Number(productId),
      },
      include: _buildDropInDetailsInclude({
        withCategory,
        withProduct,
        withLocation,
        withMerchant,
        withSchedules,
      }),
    });
    if (!dropIn) throw NotFoundError.DropIn;

    return mapDropInDetailsResponseDTO(dropIn, {
      product: dropIn.product,
      category: dropIn.category,
      schedules: dropIn.dropInSchedules,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchDropInDetails(`productId: ${productId}`);
  }
}

async function listDropIns(
  filter: DropInDetailsFilter,
  {
    withProduct,
    withCategory,
    includeArchived,
    withSchedules,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    includeArchived?: boolean;
    withSchedules?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<PaginatedResponseDTO<DropInDetailsResponseDTO, ProductOrderByKey>> {
  const {
    categoryId,
    merchantId,
    locationId,
    tags,
    region,
    age,
    locationType,
    search,
  } = filter;
  try {
    const where: Prisma.DropInDetailsWhereInput = {
      product: {
        isArchived: false,
      },
    };
    if (includeArchived) delete where.product;

    const andClauses: Prisma.DropInDetailsWhereInput[] = [];

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
      prisma.dropInDetails.findMany({
        where,
        include: _buildDropInDetailsInclude({
          withCategory,
          withProduct,
          withLocation,
          withMerchant,
          withSchedules,
        }),
        orderBy: {
          product: orderBy,
        },
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.dropInDetails.count({ where }),
    ]);

    const mapped = data.map((dropIn) =>
      mapDropInDetailsResponseDTO(dropIn, {
        product: dropIn.product,
        category: dropIn.category,
        schedules: dropIn.dropInSchedules,
      }),
    );

    return buildPaginatedResponse<DropInDetailsResponseDTO, ProductOrderByKey>(
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
    throw BadRequestError.FetchDropInDetails();
  }
}

async function updateDropIn(
  id: string | number,
  productId: string | number,
  dto: UpdateDropInDTO,
): Promise<DropInDetailsResponseDTO> {
  const { product: productDTO, dropInDetails: dropInDetailsDTO } = dto;

  try {
    const { product, dropInDetails } = await prisma.$transaction(async (tx) => {
      let updatedProduct: Product | undefined;
      let updatedDropInDetails: DropInDetails | undefined;

      if (productDTO) {
        updatedProduct =
          await ServiceLocator.ProductService.internal.updateProduct(
            productId,
            productDTO,
            tx,
          );
      }

      const existing = await tx.dropInDetails.findUnique({
        where: { id: Number(id), productId: Number(productId) },
      });
      if (!existing) throw NotFoundError.DropIn;

      if (dropInDetailsDTO) {
        updatedDropInDetails = await tx.dropInDetails.update({
          where: { id: existing.id },
          data: {
            categoryId: updatedProduct?.categoryId ?? existing.categoryId,
            minKids: dropInDetailsDTO.minKids ?? existing.minKids,
            maxKids: dropInDetailsDTO.maxKids ?? existing.maxKids,
            minParents: dropInDetailsDTO.minParents ?? existing.minParents,
            maxParents: dropInDetailsDTO.maxParents ?? existing.maxParents,
            whatsIncluded:
              dropInDetailsDTO.whatsIncluded ?? existing.whatsIncluded,
            cancellationPolicy:
              dropInDetailsDTO.cancellationPolicy ??
              existing.cancellationPolicy,
            requiresPackage:
              dropInDetailsDTO.requiresPackage ?? existing.requiresPackage,
            notes: dropInDetailsDTO.notes ?? existing.notes,
            bookingUrl: dropInDetailsDTO.bookingUrl ?? existing.bookingUrl,
          },
        });
      }

      return {
        product: updatedProduct,
        dropInDetails: updatedDropInDetails ?? existing,
      };
    });

    // Product / drop-in field changes shift the product's search doc, so reindex
    // it post-commit. Fire-and-forget; reconcile backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(
      Number(productId),
    );

    return mapDropInDetailsResponseDTO(dropInDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateDropInDetails;
  }
}

export const DropInDetailsService: IDropInDetailsService = {
  createDropIn,
  getDropInDetailsById,
  getDropInDetailsByProduct,
  listDropIns,
  updateDropIn,
};

function _buildDropInDetailsInclude(args: {
  withCategory?: boolean;
  withProduct?: boolean;
  withLocation?: boolean;
  withMerchant?: boolean;
  withSchedules?: boolean;
}): Prisma.DropInDetailsInclude {
  const {
    withCategory,
    withProduct,
    withLocation,
    withMerchant,
    withSchedules,
  } = args;

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
    dropInSchedules: withSchedules,
  };
}
