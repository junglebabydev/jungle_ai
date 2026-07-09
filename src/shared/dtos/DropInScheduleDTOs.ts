import z from "zod";
import { Helper } from "../../utils/helper";
import {
  DROP_IN_SCHEDULE_KIND,
  DropInDetails,
  DropInSchedule,
  Location,
  Product,
} from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import { TimeStringSchema, toMinutes } from "../constants";
import {
  DropInDetailsResponseDTO,
  mapDropInDetailsResponseDTO,
} from "./DropInDetailsDTOs";

export const CreateDropInScheduleSchema = z
  .object({
    kind: Helper.prismaToZodEnum(DROP_IN_SCHEDULE_KIND),

    dayOfWeek: z
      .number()
      .int()
      .min(1, "dayOfWeek must be between 1 and 7")
      .max(7, "dayOfWeek must be between 1 and 7")
      .optional(),
    startTime: TimeStringSchema.optional(),
    endTime: TimeStringSchema.optional(),

    date: z.coerce.date().optional(),
    dateStartTime: TimeStringSchema.optional(),
    dateEndTime: TimeStringSchema.optional(),

    isActive: z.boolean().optional().default(true),
    isArchived: z.boolean().optional().default(false),
  })
  .refine(
    (val) => {
      if (val.startTime && val.endTime) {
        return toMinutes(val.endTime) > toMinutes(val.startTime);
      }
      return true;
    },
    {
      message: "endTime must be later than startTime",
      path: ["endTime"],
    },
  )
  .refine(
    (val) => {
      if (val.dateStartTime && val.dateEndTime) {
        return toMinutes(val.dateEndTime) > toMinutes(val.dateStartTime);
      }
      return true;
    },
    {
      message: "dateEndTime must be later than dateStartTime",
      path: ["dateEndTime"],
    },
  );

export type CreateDropInScheduleDTO = z.infer<
  typeof CreateDropInScheduleSchema
> & {
  productId: number;
};

export const UpdateDropInScheduleSchema = CreateDropInScheduleSchema.partial();

export type UpdateDropInScheduleDTO = z.infer<
  typeof UpdateDropInScheduleSchema
>;

export type DropInScheduleResponseDTO = {
  id: number;
  dropInScheduleID: string;
  productId: number;
  product?: ProductResponseDTO | null;
  dropInDetailsId?: number | null;
  dropInDetails?: DropInDetailsResponseDTO | null;

  locationId: number;
  location?: LocationResponseDTO | null;
  kind: DROP_IN_SCHEDULE_KIND;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  date: Date | null;
  dateStartTime: string | null;
  dateEndTime: string | null;
  isActive: boolean;
  createdAt: Date;
};

export function mapDropInScheduleResponseDTO(
  dropInSchedule: DropInSchedule,
  {
    product,
    location,
    dropInDetails,
  }: {
    product?: Product;
    location?: Location;
    dropInDetails?: DropInDetails | null;
  } = {},
): DropInScheduleResponseDTO {
  const mapped: DropInScheduleResponseDTO = {
    id: dropInSchedule.id,
    dropInScheduleID: dropInSchedule.dropInScheduleID,
    productId: dropInSchedule.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    dropInDetailsId: dropInSchedule.dropInDetailsId,
    dropInDetails: dropInDetails
      ? mapDropInDetailsResponseDTO(dropInDetails)
      : undefined,
    locationId: dropInSchedule.locationId,
    location: location ? mapLocationResponseDTO(location) : undefined,
    kind: dropInSchedule.kind,
    dayOfWeek: dropInSchedule.dayOfWeek,
    startTime: dropInSchedule.startTime,
    endTime: dropInSchedule.endTime,
    date: dropInSchedule.date,
    dateStartTime: dropInSchedule.dateStartTime,
    dateEndTime: dropInSchedule.dateEndTime,
    isActive: dropInSchedule.isActive,
    createdAt: dropInSchedule.createdAt,
  };

  return mapped;
}
