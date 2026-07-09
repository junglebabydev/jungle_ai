import {
  Prisma,
  RECURRENCE_PATTERN,
  Schedule,
  SCHEDULE_STATUS,
  SCHEDULE_TYPE,
} from "@prisma/client";
import { CreateScheduleDTO } from "../../shared/dtos/ScheduleDTOs";
import { IScheduleServiceInternal } from "./service.interface";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { ScheduleWithProductAndLocation } from "../../shared/types/schedule";

async function createSchedule(
  productId: number,
  locationId: number,
  dto: CreateScheduleDTO,
  tx?: Prisma.TransactionClient
): Promise<Schedule> {
  const db = tx ?? prisma;

  try {
    return await db.schedule.create({
      data: {
        productId,
        locationId,
        scheduleType: dto.scheduleType as SCHEDULE_TYPE,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        recurrenceRule: dto.recurrenceRule as RECURRENCE_PATTERN,
        specificDate: dto.specificDate,
        specificStartTime: dto.specificStartTime,
        specificEndTime: dto.specificEndTime,
        rangeStartDate: dto.rangeStartDate,
        rangeEndDate: dto.rangeEndDate,
        termName: dto.termName,
        termStartDate: dto.termStartDate,
        termEndDate: dto.termEndDate,
        defaultRoom: dto.defaultRoom,
        maxCapacity: dto.maxCapacity,
        waitlistEnabled: dto.waitlistEnabled,
        status: (dto.status as SCHEDULE_STATUS) ?? SCHEDULE_STATUS.ACTIVE,
        cancelledAt: null,
        cancellationReason: null,
        excludedDates: dto.exculdedDates ?? [],
        isPublished: dto.isPublished ?? true,
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateSchedule;
  }
}

async function getScheduleById(
  id: number,
  {
    withProduct,
    withLocation,
  }: { withProduct?: boolean; withLocation?: boolean },
  tx?: Prisma.TransactionClient
): Promise<ScheduleWithProductAndLocation> {
  const db = tx ?? prisma;

  try {
    const schedule = await db.schedule.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        product: withProduct,
        location: withLocation,
      },
    });
    if (!schedule) throw NotFoundError.Schedule;

    return schedule;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSchedule(`id: ${id}`);
  }
}

export const ScheduleServiceInternal: IScheduleServiceInternal = {
  createSchedule,
  getScheduleById,
};
