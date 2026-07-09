import {
  Location,
  Product,
  RECURRENCE_PATTERN,
  Schedule,
  SCHEDULE_STATUS,
  SCHEDULE_TYPE,
} from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import z from "zod";
import { Helper } from "../../utils/helper";

const ScheduleBaseSchema = z.object({
  scheduleType: Helper.prismaToZodEnum(SCHEDULE_TYPE),

  dayOfWeek: z.number().int().min(0).max(6).optional(),

  startTime: z.string().optional(),
  endTime: z.string().optional(),

  recurrenceRule: Helper.prismaToZodEnum(RECURRENCE_PATTERN).optional(),

  specificDate: z.coerce.date().optional(),
  specificStartTime: z.string().optional(),
  specificEndTime: z.string().optional(),

  rangeStartDate: z.coerce.date().optional(),
  rangeEndDate: z.coerce.date().optional(),

  termName: z.string().optional(),
  termStartDate: z.coerce.date().optional(),
  termEndDate: z.coerce.date().optional(),

  defaultRoom: z.string().optional(),
  maxCapacity: z.number().int().positive(),
  waitlistEnabled: z.boolean().optional().default(false),

  status: Helper.prismaToZodEnum(SCHEDULE_STATUS).optional(),
  exculdedDates: z.array(z.coerce.date()).optional().default([]),
  isPublished: z.boolean().optional().default(true),

  instructorId: z.int().positive().optional(),
});

export const CreateScheduleSchema = ScheduleBaseSchema;

export type CreateScheduleDTO = z.infer<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = CreateScheduleSchema.pick({
  defaultRoom: true,
  maxCapacity: true,
  waitlistEnabled: true,
  status: true,
  isPublished: true,
}).partial();

export type UpdateScheduleDTO = z.infer<typeof UpdateScheduleSchema>;

export type ScheduleResponseDTO = {
  id: number;
  scheduleID: string;
  productId: number;
  product?: ProductResponseDTO;
  locationId: number;
  location?: LocationResponseDTO;
  scheduleType: SCHEDULE_TYPE;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  recurrenceRule: string | null;
  specificDate: Date | null;
  specificStartTime: string | null;
  specificEndTime: string | null;
  rangeStartDate: Date | null;
  rangeEndDate: Date | null;
  termName: string | null;
  termStartDate: Date | null;
  termEndDate: Date | null;
  defaultRoom: string | null;
  maxCapacity: number;
  waitlistEnabled: boolean;
  status: SCHEDULE_STATUS;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  excludedDates: Date[];
  isPublished: boolean;
  createdAt: Date;
};

export function mapScheduleResponseDTO(
  schedule: Schedule,
  { product, location }: { product?: Product; location?: Location } = {}
): ScheduleResponseDTO {
  const mapped: ScheduleResponseDTO = {
    id: schedule.id,
    scheduleID: schedule.scheduleID,
    productId: schedule.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    locationId: schedule.locationId,
    location: location ? mapLocationResponseDTO(location, {}) : undefined,
    scheduleType: schedule.scheduleType,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    recurrenceRule: schedule.recurrenceRule,
    specificDate: schedule.specificDate,
    specificStartTime: schedule.specificStartTime,
    specificEndTime: schedule.specificEndTime,
    rangeStartDate: schedule.rangeStartDate,
    rangeEndDate: schedule.rangeEndDate,
    termName: schedule.termName,
    termStartDate: schedule.termStartDate,
    termEndDate: schedule.termEndDate,
    defaultRoom: schedule.defaultRoom,
    maxCapacity: schedule.maxCapacity,
    waitlistEnabled: schedule.waitlistEnabled,
    status: schedule.status,
    cancelledAt: schedule.cancelledAt,
    cancellationReason: schedule.cancellationReason,
    excludedDates: schedule.excludedDates,
    isPublished: schedule.isPublished,
    createdAt: schedule.createdAt,
  };

  return mapped;
}
