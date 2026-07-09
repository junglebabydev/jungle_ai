import {
  Location,
  LocationUser,
  Product,
  Schedule,
  Session,
  SESSION_STATUS,
} from "@prisma/client";
import { LocationResponseDTO, mapLocationResponseDTO } from "./LocationDTOs";
import { mapProductResponseDTO, ProductResponseDTO } from "./ProductDTOs";
import { mapScheduleResponseDTO, ScheduleResponseDTO } from "./ScheduleDTOs";
import {
  LocationUserResponseDTO,
  mapLocationUserResponseDTO,
} from "./LocationUserDTOs";
import z from "zod";
import { TimeStringSchema, toMinutes } from "../constants";
import { Helper } from "../../utils/helper";

export const CreateSessionBodySchema = z
  .object({
    instructorId: z.int().positive().optional(),
    name: z.string().min(1).optional(),
    sessionDate: z.coerce.date(),
    startTime: TimeStringSchema,
    endTime: TimeStringSchema,
    maxCapacity: z.int().positive(),
    currentEnrolled: z.int().positive().optional().default(0),
    availableSlots: z.int().positive(),
    status: Helper.prismaToZodEnum(SESSION_STATUS)
      .optional()
      .default(SESSION_STATUS.SCHEDULED),
    roomOverride: z.string().min(1).optional(),
    sessionNotes: z.string().optional(),
  })
  .refine(
    (val) => {
      // check endTime is after startTime
      return toMinutes(val.endTime) > toMinutes(val.startTime);
    },
    {
      message: "endTime must be later than startTime",
      path: ["endTime"],
    },
  );

export type CreateSessionBodyDTO = z.infer<typeof CreateSessionBodySchema>;

export type CreateSessionDTO = CreateSessionBodyDTO & {
  scheduleId: number;
  locationId: number;
  productId: number;
};

export const UpdateSessionBodySchema = z
  .object({
    instructorId: z.int().positive().optional(),
    name: z.string().min(1).optional(),
    sessionDate: z.coerce.date().optional(),
    startTime: TimeStringSchema.optional(),
    endTime: TimeStringSchema.optional(),
    maxCapacity: z.int().positive().optional(),
    currentEnrolled: z.int().positive().optional(),
    availableSlots: z.int().positive().optional(),
    status: Helper.prismaToZodEnum(SESSION_STATUS).optional(),
    roomOverride: z.string().min(1).optional(),
    sessionNotes: z.string().optional(),
  })
  .refine(
    (val) => {
      // check endTime is after startTime if both are provided
      if (val.startTime && val.endTime) {
        const toMinutes = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m;
        };
        return toMinutes(val.endTime) > toMinutes(val.startTime);
      }
      return true;
    },
    {
      message: "endTime must be later than startTime",
      path: ["endTime"],
    },
  );

export type UpdateSessionBodyDTO = z.infer<typeof UpdateSessionBodySchema>;

export type UpdateSessionDTO = UpdateSessionBodyDTO & {
  sessionId: number;
  locationId: number;
  productId: number;
};

export type UpdateSessionInternalDTO = {
  sessionId: number;
  instructorId?: number;
  name?: string;
  sessionDate?: Date;
  startTime?: string;
  endTime?: string;
  maxCapacity?: number;
  currentEnrolled?: number;
  availableSlots?: number;
  status?: SESSION_STATUS;
  roomOverride?: string;
  sessionNotes?: string;
};

export type SessionResponseDTO = {
  id: number;
  sessionID: string;
  scheduleId: number;
  schedule?: ScheduleResponseDTO;
  productId: number;
  product?: ProductResponseDTO;
  locationId: number;
  location?: LocationResponseDTO;
  instructorId: number | null;
  instructor?: LocationUserResponseDTO | null;
  name: string | null;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  currentEnrolled: number;
  availableSlots: number;
  status: SESSION_STATUS;
  isCancelled: boolean;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  roomOverride: string | null;
  sessionNotes: string | null;
  createdAt: Date;
};

export type CancelSessionResponseDTO = {
  session: SessionResponseDTO;
  enrollmentsCancelled: number;
};

export function mapSessionResponseDTO(
  session: Session,
  {
    schedule,
    product,
    location,
    instructor,
  }: {
    schedule?: Schedule;
    product?: Product;
    location?: Location;
    instructor?: LocationUser | null;
  } = {},
): SessionResponseDTO {
  const mapped: SessionResponseDTO = {
    id: session.id,
    sessionID: session.sessionID,
    scheduleId: session.scheduleId,
    schedule: schedule ? mapScheduleResponseDTO(schedule) : undefined,
    productId: session.productId,
    product: product ? mapProductResponseDTO(product) : undefined,
    locationId: session.locationId,
    location: location ? mapLocationResponseDTO(location) : undefined,
    instructorId: session.instructorId,
    instructor: instructor ? mapLocationUserResponseDTO(instructor) : undefined,
    name: session.name,
    sessionDate: session.sessionDate,
    startTime: session.startTime,
    endTime: session.endTime,
    maxCapacity: session.maxCapacity,
    currentEnrolled: session.currentEnrolled,
    availableSlots: session.availableSlots,
    status: session.status,
    isCancelled: session.isCancelled,
    cancelledAt: session.cancelledAt,
    cancellationReason: session.cancellationReason,
    roomOverride: session.roomOverride,
    sessionNotes: session.sessionNotes,
    createdAt: session.createdAt,
  };

  return mapped;
}
