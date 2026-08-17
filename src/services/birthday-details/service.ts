import {
  BIRTHDAY_VENUE_TYPE,
  BirthdayDetails,
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
  BirthdayDetailsFilter,
  BirthdayDetailsResponseDTO,
  CreateBirthdayDTO,
  mapBirthdayDetailsResponseDTO,
  UpdateBirthdayDTO,
} from "../../shared/dtos/BirthdayDetailsDTOs";
import { IBirthdayDetailsService } from "./service.interface";
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

async function createBirthday(
  locationId: string | number,
  dto: CreateBirthdayDTO,
): Promise<BirthdayDetailsResponseDTO> {
  const { product: productDTO, birthdayDetails: birthdayDetailsDTO } = dto;

  try {
    const { product, birthdayDetails } = await prisma.$transaction(
      async (tx) => {
        const product =
          await ServiceLocator.ProductService.internal.createProduct(
            locationId,
            productDTO,
            tx,
          );

        const birthdayDetails = await tx.birthdayDetails.create({
          data: {
            productId: product.id,
            categoryId: product.categoryId,
            venueType: birthdayDetailsDTO.venueType as BIRTHDAY_VENUE_TYPE,
            durationMinutes: birthdayDetailsDTO.durationMinutes,
            minKids: birthdayDetailsDTO.minKids,
            maxKids: birthdayDetailsDTO.maxKids,
            minParents: birthdayDetailsDTO.minParents,
            maxParents: birthdayDetailsDTO.maxParents,
            whatsIncluded: birthdayDetailsDTO.whatsIncluded,
            cancellationPolicy: birthdayDetailsDTO.cancellationPolicy,
            requiresPackage: birthdayDetailsDTO.requiresPackage,
          },
        });

        return { product, birthdayDetails };
      },
    );

    return mapBirthdayDetailsResponseDTO(birthdayDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateBirthdayDetails;
  }
}

async function getBirthdayDetailsById(
  id: string | number,
  {
    withProduct,
    withCategory,
    withAddons,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withAddons?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<BirthdayDetailsResponseDTO> {
  try {
    const birthdayDetails = await prisma.birthdayDetails.findUnique({
      where: {
        id: Number(id),
      },
      include: _buildBirthdayDetailsInclude({
        withProduct,
        withCategory,
        withAddons,
        withLocation,
        withMerchant,
      }),
    });
    if (!birthdayDetails) throw NotFoundError.BirthdayDetails;

    return mapBirthdayDetailsResponseDTO(birthdayDetails, {
      product: birthdayDetails.product,
      category: birthdayDetails.category,
      addons: birthdayDetails.birthdayAddons,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchBirthdayDetails(`id: ${id}`);
  }
}

async function getBirthdayDetailsByProduct(
  productId: string | number,
  {
    withProduct,
    withCategory,
    withAddons,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withAddons?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<BirthdayDetailsResponseDTO> {
  try {
    const birthdayDetails = await prisma.birthdayDetails.findUnique({
      where: {
        productId: Number(productId),
      },
      include: _buildBirthdayDetailsInclude({
        withProduct,
        withCategory,
        withAddons,
        withLocation,
        withMerchant,
      }),
    });
    if (!birthdayDetails) throw NotFoundError.BirthdayDetails;

    return mapBirthdayDetailsResponseDTO(birthdayDetails, {
      product: birthdayDetails.product,
      category: birthdayDetails.category,
      addons: birthdayDetails.birthdayAddons,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchBirthdayDetails(`productId: ${productId}`);
  }
}

async function listBirthdays(
  filter: BirthdayDetailsFilter,
  {
    withProduct,
    withCategory,
    includeArchived,
    withAddons,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    includeArchived?: boolean;
    withAddons?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  },
): Promise<
  PaginatedResponseDTO<BirthdayDetailsResponseDTO, ProductOrderByKey>
> {
  const {
    categoryId,
    merchantId,
    locationId,
    tags,
    region,
    age,
    locationType,
    durationMinutes,
    kidsCount,
    parentsCount,
    venueType,
    search,
  } = filter;
  try {
    const where: Prisma.BirthdayDetailsWhereInput = {
      product: {
        isArchived: false,
      },
    };
    if (includeArchived) delete where.product;

    const andClauses: Prisma.BirthdayDetailsWhereInput[] = [];

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

    if (durationMinutes) {
      andClauses.push({
        durationMinutes: {
          gte: Number(durationMinutes),
        },
      });
    }

    if (kidsCount) {
      andClauses.push({
        AND: [
          {
            minKids: {
              lte: kidsCount,
            },
          },
          {
            maxKids: {
              gte: kidsCount,
            },
          },
        ],
      });
    }

    if (parentsCount) {
      andClauses.push({
        AND: [
          {
            minParents: {
              lte: parentsCount,
            },
          },
          {
            maxParents: {
              gte: parentsCount,
            },
          },
        ],
      });
    }

    if (venueType) {
      andClauses.push({
        venueType: venueType as BIRTHDAY_VENUE_TYPE,
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
      prisma.birthdayDetails.findMany({
        where,
        include: _buildBirthdayDetailsInclude({
          withProduct,
          withCategory,
          withAddons,
          withLocation,
          withMerchant,
        }),
        orderBy: {
          product: orderBy,
        },
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.birthdayDetails.count({ where }),
    ]);

    const mapped = data.map((birthday) =>
      mapBirthdayDetailsResponseDTO(birthday, {
        product: birthday.product,
        category: birthday.category,
        addons: birthday.birthdayAddons,
      }),
    );

    return buildPaginatedResponse<
      BirthdayDetailsResponseDTO,
      ProductOrderByKey
    >(mapped, total, {
      page: meta.page,
      pageSize: meta.pageSize,
      order: meta.order,
      orderBy: meta.orderBy,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchBirthdayDetails();
  }
}

async function updateBirthday(
  id: string | number,
  productId: string | number,
  dto: UpdateBirthdayDTO,
): Promise<BirthdayDetailsResponseDTO> {
  const { product: productDTO, birthdayDetails: birthdayDetailsDTO } = dto;

  try {
    const { product, birthdayDetails } = await prisma.$transaction(
      async (tx) => {
        let updatedProduct: Product | undefined;
        let updatedBirthdayDetails: BirthdayDetails | undefined;

        if (productDTO) {
          updatedProduct =
            await ServiceLocator.ProductService.internal.updateProduct(
              productId,
              productDTO,
              tx,
            );
        }

        const existing = await tx.birthdayDetails.findUnique({
          where: { id: Number(id), productId: Number(productId) },
        });
        if (!existing) throw NotFoundError.BirthdayDetails;

        if (birthdayDetailsDTO) {
          updatedBirthdayDetails = await tx.birthdayDetails.update({
            where: { id: existing.id },
            data: {
              categoryId: updatedProduct?.categoryId ?? existing.categoryId,
              venueType:
                (birthdayDetailsDTO.venueType as BIRTHDAY_VENUE_TYPE) ??
                existing.venueType,
              durationMinutes:
                birthdayDetailsDTO.durationMinutes ?? existing.durationMinutes,
              minKids: birthdayDetailsDTO.minKids ?? existing.minKids,
              maxKids: birthdayDetailsDTO.maxKids ?? existing.maxKids,
              minParents: birthdayDetailsDTO.minParents ?? existing.minParents,
              maxParents: birthdayDetailsDTO.maxParents ?? existing.maxParents,
              whatsIncluded:
                birthdayDetailsDTO.whatsIncluded ?? existing.whatsIncluded,
              cancellationPolicy:
                birthdayDetailsDTO.cancellationPolicy ??
                existing.cancellationPolicy,
              requiresPackage:
                birthdayDetailsDTO.requiresPackage ?? existing.requiresPackage,
            },
          });
        }

        return {
          product: updatedProduct,
          birthdayDetails: updatedBirthdayDetails ?? existing,
        };
      },
    );

    return mapBirthdayDetailsResponseDTO(birthdayDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateBirthdayDetails;
  }
}

export const BirthdayDetailsService: IBirthdayDetailsService = {
  createBirthday,
  getBirthdayDetailsById,
  getBirthdayDetailsByProduct,
  listBirthdays,
  updateBirthday,
};

function _buildBirthdayDetailsInclude(args: {
  withCategory?: boolean;
  withProduct?: boolean;
  withLocation?: boolean;
  withMerchant?: boolean;
  withAddons?: boolean;
}): Prisma.BirthdayDetailsInclude {
  const { withCategory, withProduct, withLocation, withMerchant, withAddons } =
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
    birthdayAddons: withAddons,
  };
}
