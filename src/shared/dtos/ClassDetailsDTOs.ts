import {
  CLASS_FORMAT,
  ClassDetails,
  Product,
  PRODUCT_TYPE,
  ProductCategory,
  SG_REGIONS,
} from "@prisma/client";
import {
  mapProductCategoryResponseDTO,
  ProductCategoryResonseDTO,
} from "./ProductCategoryDTOs";
import {
  CreateProductBaseSchema,
  mapProductResponseDTO,
  ProductOrderByKey,
  ProductResponseDTO,
  UpdateProductSchema,
} from "./ProductDTOs";
import z from "zod";
import { Helper } from "../../utils/helper";
import { PaginatedRequestDTO } from "./PaginationDTO";
import { ProductExtended } from "../types/product";

export const CreateClassDetailsSchema = z.object({
  format: Helper.prismaToZodEnum(CLASS_FORMAT),
  duration: z.number().positive(),
  maxCapacity: z.number().positive(),
  minEnrollment: z.number().positive().optional(),
  developmentStage: z.string().optional(),
  skillLevel: z.string().optional(),
  skillLevelCode: z.string().optional(),
  gradeLevel: z.string().optional(),
  prerequisite: z.string().optional(),
  progressionPath: z.string().optional(),
  assessmentRequired: z.boolean().optional().default(false),
  estimatedLessons: z.number().positive().optional(),
  typicalDurationWeeks: z.number().positive().optional(),
  allowTrials: z.boolean().optional().default(true),
  maxTrialsPerChild: z.number().positive().optional().default(1),
  requiresPackage: z.boolean().optional().default(false),
  allowDropIn: z.boolean().optional().default(false),
  isTermBased: z.boolean().optional().default(false),
  termLengthWeeks: z.number().positive().optional(),
  sessionsPerWeek: z.number().positive().optional().default(1),
  totalSessionsPerTerm: z.number().positive().optional().default(1),
  curriculum: z.string().optional(),
  learningObjectives: z.array(z.string()).optional().default([]),
  materialsIncluded: z.string().optional(),
  materialsRequired: z.string().optional(),
  specialNeeds: z.boolean().optional().default(false),
  ratioRequirement: z.string().optional(),
  dresscode: z.string().optional(),
  cancellationPolicy: z.string().optional(),
});

export type CreateClassDetailsDTO = z.infer<typeof CreateClassDetailsSchema>;

export const CreateClassProductSchema = CreateProductBaseSchema.safeExtend({
  productType: z.literal(PRODUCT_TYPE.CLASS),
});

export type CreateClassProductDTO = z.infer<typeof CreateClassProductSchema>;

export const UpdateClassDetailsSchema = CreateClassDetailsSchema.partial().omit(
  {
    typicalDurationWeeks: true,
    termLengthWeeks: true,
    sessionsPerWeek: true,
    totalSessionsPerTerm: true,
  },
);
export type UpdateClassDetailsDTO = z.infer<typeof UpdateClassDetailsSchema>;

export const UpdateClassSchema = z.object({
  product: UpdateProductSchema.optional(),
  classDetails: UpdateClassDetailsSchema.optional(),
});

export type UpdateClassDTO = z.infer<typeof UpdateClassSchema>;

export const CreateClassSchema = z.object({
  product: CreateClassProductSchema,
  classDetails: CreateClassDetailsSchema,
});

export type CreateClassDTO = z.infer<typeof CreateClassSchema>;

export const ClassDetailsFilterQuerySchema = z.object({
  categoryId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  merchantId: z.number().int().positive().optional(),
});

export const ClassDetailsFilterBodySchema = z.object({
  region: Helper.prismaToZodEnum(SG_REGIONS).optional(),
  tags: z.array(z.string()).optional(),
  age: z.number().int().positive().optional(),
  locationType: Helper.prismaToZodEnum(PRODUCT_TYPE).optional(),
  search: z.string().optional(),
});

export type ClassDetailsFilterQuery = z.infer<
  typeof ClassDetailsFilterQuerySchema
> &
  PaginatedRequestDTO<ProductOrderByKey>;

export type ClassDetailsFilterBody = z.infer<
  typeof ClassDetailsFilterBodySchema
>;

export type ClassDetailsFilter = ClassDetailsFilterQuery &
  ClassDetailsFilterBody;

export type ClassDetailsResponseDTO = {
  id: number;
  classID: string;
  productId: number;
  product?: ProductResponseDTO;
  categoryId: number | null;
  category?: ProductCategoryResonseDTO | null;
  duration: number;
  maxCapacity: number;
  developmentStage: string | null;
  skillLevel: string | null;
  skillLevelCode: string | null;
  gradeLevel: string | null;
  prerequisite: string | null;
  progressionPath: string | null;
  assessmentRequired: boolean;
  estimatedLessons: number | null;
  typicalDurationWeeks: number | null;
  maxTrialsPerChild: number;
  allowDropIn: boolean;
  isTermBased: boolean;
  termLengthWeeks: number | null;
  sessionsPerWeek: number | null;
  totalSessionsPerTerm: number;
  learningObjectives: string[];
  materialsIncluded: string | null;
  materialsRequired: string | null;
  specialNeeds: boolean;
  ratioRequirement: string | null;
  dresscode: string | null;
  // A parent asks this of a class as readily as of a party. Null when unstated.
  cancellationPolicy: string | null;
};

export function mapClassDetailsResponseDTO(
  classDetails: ClassDetails,
  {
    product,
    category,
  }: {
    product?: Product | ProductExtended;
    category?: ProductCategory | null;
  } = {},
): ClassDetailsResponseDTO {
  const mapped: ClassDetailsResponseDTO = {
    id: classDetails.id,
    classID: classDetails.classID,
    productId: classDetails.productId,
    product: product
      ? Helper.isProductExtended(product)
        ? mapProductResponseDTO(product, {
            location: product.location,
            merchant: product.location?.merchant,
          })
        : mapProductResponseDTO(product)
      : undefined,
    categoryId: classDetails.categoryId,
    category: category ? mapProductCategoryResponseDTO(category) : null,
    duration: classDetails.duration,
    maxCapacity: classDetails.maxCapacity,
    developmentStage: classDetails.developmentStage,
    skillLevel: classDetails.skillLevel,
    skillLevelCode: classDetails.skillLevelCode,
    gradeLevel: classDetails.gradeLevel,
    prerequisite: classDetails.prerequisite,
    progressionPath: classDetails.progressionPath,
    assessmentRequired: classDetails.assessmentRequired,
    estimatedLessons: classDetails.estimatedLessons,
    typicalDurationWeeks: classDetails.typicalDurationWeeks,
    maxTrialsPerChild: classDetails.maxTrialsPerChild,
    allowDropIn: classDetails.allowDropIn,
    isTermBased: classDetails.isTermBased,
    termLengthWeeks: classDetails.termLengthWeeks,
    sessionsPerWeek: classDetails.sessionsPerWeek,
    totalSessionsPerTerm: classDetails.totalSessionsPerTerm,
    learningObjectives: classDetails.learningObjectives,
    materialsIncluded: classDetails.materialsIncluded,
    materialsRequired: classDetails.materialsRequired,
    specialNeeds: classDetails.specialNeeds,
    ratioRequirement: classDetails.ratioRequirement,
    dresscode: classDetails.dresscode,
    cancellationPolicy: classDetails.cancellationPolicy,
  };

  return mapped;
}
