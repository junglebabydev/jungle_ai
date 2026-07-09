import {
  CLASS_FORMAT,
  LOCATION_TYPE,
  Prisma,
  Product,
  SG_REGIONS,
} from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  ClassDetailsFilter,
  ClassDetailsResponseDTO,
  CreateClassDTO,
  mapClassDetailsResponseDTO,
  UpdateClassDTO,
} from "../../shared/dtos/ClassDetailsDTOs";
import { IClassDetailsService } from "./service.interface";
import { NotFoundError } from "../../errors/domains/NotFoundError";
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

async function createClass(
  locationId: string | number,
  dto: CreateClassDTO,
): Promise<ClassDetailsResponseDTO> {
  const { product: productDTO, classDetails: classDetailsDTO } = dto;

  try {
    const { product, classDetails } = await prisma.$transaction(async (tx) => {
      const product =
        await ServiceLocator.ProductService.internal.createProduct(
          locationId,
          productDTO,
          tx,
        );

      const classDetails = await tx.classDetails.create({
        data: {
          productId: product.id,
          categoryId: product.categoryId,
          format: classDetailsDTO.format as CLASS_FORMAT,
          duration: classDetailsDTO.duration,
          maxCapacity: classDetailsDTO.maxCapacity,
          minEnrollment: classDetailsDTO.minEnrollment,
          developmentStage: classDetailsDTO.developmentStage,
          skillLevel: classDetailsDTO.skillLevel,
          skillLevelCode: classDetailsDTO.skillLevelCode,
          gradeLevel: classDetailsDTO.gradeLevel,
          prerequisite: classDetailsDTO.prerequisite,
          progressionPath: classDetailsDTO.progressionPath,
          assessmentRequired: classDetailsDTO.assessmentRequired,
          estimatedLessons: classDetailsDTO.estimatedLessons,
          typicalDurationWeeks: classDetailsDTO.typicalDurationWeeks,
          allowTrials: classDetailsDTO.allowTrials,
          maxTrialsPerChild: classDetailsDTO.maxTrialsPerChild,
          requiresPackage: classDetailsDTO.requiresPackage,
          allowDropIn: classDetailsDTO.allowDropIn,
          isTermBased: classDetailsDTO.isTermBased,
          termLengthWeeks: classDetailsDTO.termLengthWeeks,
          sessionsPerWeek: classDetailsDTO.sessionsPerWeek,
          totalSessionsPerTerm: classDetailsDTO.totalSessionsPerTerm,
          curriculum: classDetailsDTO.curriculum,
          learningObjectives: classDetailsDTO.learningObjectives,
          materialsIncluded: classDetailsDTO.materialsIncluded,
          materialsRequired: classDetailsDTO.materialsRequired,
          specialNeeds: classDetailsDTO.specialNeeds,
          ratioRequirement: classDetailsDTO.ratioRequirement,
          dresscode: classDetailsDTO.dresscode,
        },
      });

      return { product, classDetails };
    });

    // Reindex the new product post-commit so it enters the search index. Fire-
    // and-forget; the periodic reconcile is the backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(product.id);

    return mapClassDetailsResponseDTO(classDetails, { product });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateClass;
  }
}

async function getClassDetailsById(
  id: string | number,
  {
    withProduct,
    withCategory,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<ClassDetailsResponseDTO> {
  try {
    const classDetails = await prisma.classDetails.findUnique({
      where: {
        id: Number(id),
      },
      include: _buildClassDetailsInclude({
        withProduct,
        withCategory,
        withLocation,
        withMerchant,
      }),
    });
    if (!classDetails) throw NotFoundError.ClassDetails;

    return mapClassDetailsResponseDTO(classDetails, {
      product: classDetails.product,
      category: classDetails.category,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchClassDetails(`by id: ${id}`);
  }
}

async function getClassDetailsByProductId(
  productId: string | number,
  {
    withProduct,
    withCategory,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<ClassDetailsResponseDTO> {
  try {
    const classDetails = await prisma.classDetails.findUnique({
      where: {
        productId: Number(productId),
      },
      include: _buildClassDetailsInclude({
        withProduct,
        withCategory,
        withLocation,
        withMerchant,
      }),
    });
    if (!classDetails) throw NotFoundError.ClassDetails;

    return mapClassDetailsResponseDTO(classDetails, {
      product: classDetails.product,
      category: classDetails.category,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchClassDetails(`by productId: ${productId}`);
  }
}

async function listClasses(
  filter: ClassDetailsFilter,
  {
    withProduct,
    withCategory,
    includeArchived,
    withLocation,
    withMerchant,
  }: {
    withProduct?: boolean;
    withCategory?: boolean;
    includeArchived?: boolean;
    withLocation?: boolean;
    withMerchant?: boolean;
  } = {},
): Promise<PaginatedResponseDTO<ClassDetailsResponseDTO, ProductOrderByKey>> {
  const {
    categoryId,
    merchantId,
    locationId,
    region,
    tags,
    age,
    locationType,
    search,
  } = filter;

  try {
    const where: Prisma.ClassDetailsWhereInput = {
      product: {
        isArchived: false,
      },
    };
    if (includeArchived) delete where.product;

    const andClauses: Prisma.ClassDetailsWhereInput[] = [];

    if (categoryId) andClauses.push({ categoryId: Number(categoryId) });

    if (merchantId)
      andClauses.push({
        product: {
          location: {
            merchantId: Number(merchantId),
          },
        },
      });

    if (locationId)
      andClauses.push({
        product: {
          locationId: Number(locationId),
        },
      });

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
      prisma.classDetails.findMany({
        where,
        include: _buildClassDetailsInclude({
          withProduct,
          withCategory,
          withLocation,
          withMerchant,
        }),
        orderBy: {
          product: orderBy,
        },
        skip: meta.skip,
        take: meta.take,
      }),
      prisma.classDetails.count({ where }),
    ]);

    const mapped = data.map((c) =>
      mapClassDetailsResponseDTO(c, {
        product: c.product,
        category: c.category,
      }),
    );

    return buildPaginatedResponse<ClassDetailsResponseDTO, ProductOrderByKey>(
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
    throw BadRequestError.FetchClassDetails();
  }
}

async function updateClass(
  id: string | number,
  productId: string | number,
  dto: UpdateClassDTO,
): Promise<ClassDetailsResponseDTO> {
  try {
    const { updatedProduct, updatedClassDetails } = await prisma.$transaction(
      async (tx) => {
        let updatedProduct: Product | undefined;

        if (dto.product)
          updatedProduct =
            await ServiceLocator.ProductService.internal.updateProduct(
              productId,
              dto.product,
              tx,
            );

        const existing = await tx.classDetails.findUnique({
          where: { id: Number(id) },
        });

        const updatedClassDetails = await tx.classDetails.update({
          where: { id: Number(id) },
          data: {
            ...dto.classDetails,
            format:
              (dto.classDetails?.format as CLASS_FORMAT) ?? existing?.format,
          },
        });

        return {
          updatedProduct,
          updatedClassDetails,
        };
      },
    );

    // Product / class field changes shift the product's search doc, so reindex it
    // post-commit. Fire-and-forget; reconcile backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(
      Number(productId),
    );

    return mapClassDetailsResponseDTO(updatedClassDetails, {
      product: updatedProduct,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateClass;
  }
}

export const ClassDetailsService: IClassDetailsService = {
  createClass,
  getClassDetailsById,
  getClassDetailsByProductId,
  listClasses,
  updateClass,
};

function _buildClassDetailsInclude(args: {
  withCategory?: boolean;
  withProduct?: boolean;
  withLocation?: boolean;
  withMerchant?: boolean;
}): Prisma.DropInDetailsInclude {
  const { withCategory, withProduct, withLocation, withMerchant } = args;

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
  };
}
