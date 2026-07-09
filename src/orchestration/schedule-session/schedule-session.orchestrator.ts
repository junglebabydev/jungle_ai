import { addDays, isSameDay, startOfDay } from "date-fns";
import { ServiceLocator } from "../../services";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import {
  CreateSessionDTO,
  SessionResponseDTO,
} from "../../shared/dtos/SessionDTOs";
import { IScheduleSessionOrchestrator } from "./schedule-session.orchestrator.interface";
import {
  CreateScheduleDTO,
  mapScheduleResponseDTO,
  ScheduleResponseDTO,
} from "../../shared/dtos/ScheduleDTOs";
import prisma from "../../config/prisma";
import {
  Prisma,
  Schedule,
  SCHEDULE_TYPE,
  Session,
  SESSION_STATUS,
} from "@prisma/client";
import { ScheduleUtils } from "../../utils/scheduleUtils";
import { GenericError } from "../../errors/domains/GenericError";

async function createScheduleWithInitialSessions(
  productId: number,
  locationId: number,
  dto: CreateScheduleDTO
): Promise<ScheduleResponseDTO> {
  try {
    const now = new Date();
    const from = startOfDay(now);
    const to = startOfDay(addDays(now, 30));

    const result = await prisma.$transaction(async (tx) => {
      const schedule =
        await ServiceLocator.ScheduleService.internal.createSchedule(
          productId,
          locationId,
          dto,
          tx
        );

      switch (schedule.scheduleType) {
        case SCHEDULE_TYPE.RECURRING:
          await _generateRecurringSessionsForWindow({
            schedule,
            from,
            to,
            tx,
            instructorId: dto.instructorId,
          });
          break;
        case SCHEDULE_TYPE.DATE_RANGE:
          await _generateDateRangeSessions({
            schedule,
            tx,
            instructorId: dto.instructorId,
          });
          break;
        case SCHEDULE_TYPE.FIXED_DATE:
          await _generateFixedDateSession({
            schedule,
            tx,
            instructorId: dto.instructorId,
          });
          break;
      }

      return schedule;
    });

    return mapScheduleResponseDTO(result);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.GenerateSessionsForSchedule();
  }
}

async function expandRecurringScheduleSessions(
  scheduleId: number,
  { days }: { days?: number }
): Promise<SessionResponseDTO[]> {
  throw GenericError.MethodNotImplemented;
}

export const ScheduleSessionOrchestrator: IScheduleSessionOrchestrator = {
  createScheduleWithInitialSessions,
  expandRecurringScheduleSessions,
};

/////////////////////
// Helper Methods
////////////////////

async function _generateRecurringSessionsForWindow({
  schedule,
  from,
  to,
  tx,
  instructorId,
}: {
  schedule: Schedule;
  from: Date;
  to: Date;
  tx: Prisma.TransactionClient;
  instructorId?: number;
}) {
  const occurrences = ScheduleUtils.expandRecurringScheduleToDates(
    schedule,
    from,
    to
  );
  if (!occurrences.length) return;

  const existing =
    await ServiceLocator.SessionService.internal.listSessionsByScheduleInRange(
      schedule.id,
      from,
      to,
      {},
      tx
    );

  const existingDates = new Set(
    existing.map((s: Session) => startOfDay(s.sessionDate).toISOString())
  );

  const toCreate = occurrences.filter((occ) => {
    const key = startOfDay(occ.date).toISOString();
    return !existingDates.has(key);
  });

  if (!toCreate.length) return;

  const dto: CreateSessionDTO[] = toCreate.map((occ) => ({
    scheduleId: schedule.id,
    productId: schedule.productId,
    locationId: schedule.locationId,
    instructorId,
    sessionDate: occ.date,
    startTime: occ.startTime,
    endTime: occ.endTime,
    maxCapacity: schedule.maxCapacity,
    currentEnrolled: 0,
    availableSlots: schedule.maxCapacity,
    status: SESSION_STATUS.SCHEDULED,
  }));

  return await ServiceLocator.SessionService.internal.createMultipleSessions(
    dto,
    tx
  );
}

async function _generateFixedDateSession({
  schedule,
  tx,
  instructorId,
}: {
  schedule: Schedule;
  tx: Prisma.TransactionClient;
  instructorId?: number;
}) {
  if (
    !schedule.specificDate ||
    !schedule.specificStartTime ||
    !schedule.specificEndTime
  )
    return;

  const sessionDate = startOfDay(schedule.specificDate);

  const existing =
    await ServiceLocator.SessionService.internal.findSessionByScheduleAndDate(
      schedule.id,
      sessionDate,
      tx
    );
  if (existing) return;

  const dto: CreateSessionDTO = {
    scheduleId: schedule.id,
    productId: schedule.productId,
    locationId: schedule.locationId,
    instructorId,
    sessionDate: sessionDate,
    startTime: schedule.specificStartTime,
    endTime: schedule.specificEndTime,
    maxCapacity: schedule.maxCapacity,
    currentEnrolled: 0,
    availableSlots: schedule.maxCapacity,
    status: SESSION_STATUS.SCHEDULED,
  };

  return await ServiceLocator.SessionService.internal.createSession(dto, tx);
}

async function _generateDateRangeSessions({
  schedule,
  tx,
  instructorId,
}: {
  schedule: Schedule;
  tx: Prisma.TransactionClient;
  instructorId?: number;
}) {
  if (!schedule.rangeStartDate || !schedule.rangeEndDate) return;

  const rangeStart = startOfDay(schedule.rangeStartDate);
  const rangeEnd = startOfDay(schedule.rangeEndDate);

  if (rangeEnd < rangeStart) return;

  const existing =
    await ServiceLocator.SessionService.internal.listSessionsByScheduleInRange(
      schedule.id,
      rangeStart,
      rangeEnd,
      {},
      tx
    );

  const existingDates = new Set(
    existing.map((s: Session) => startOfDay(s.sessionDate).toISOString())
  );

  console.log("Existing Dates:", existingDates);

  const excludedDates = new Set(
    schedule.excludedDates.map((d) => startOfDay(d).toISOString())
  );

  console.log("Excluded Dates:", excludedDates);

  const occurrences = ScheduleUtils.expandRecurringScheduleToDates(
    schedule,
    rangeStart,
    rangeEnd
  );

  console.log("Occurences:", occurrences);

  const toCreate = occurrences.filter((occ) => {
    const key = startOfDay(occ.date).toISOString();
    return !existingDates.has(key);
  });

  console.log("To Create Sessions:", toCreate);

  if (!toCreate.length) return;

  const dto: CreateSessionDTO[] = toCreate.map((occ) => ({
    scheduleId: schedule.id,
    productId: schedule.productId,
    locationId: schedule.locationId,
    instructorId,
    sessionDate: occ.date,
    startTime: occ.startTime ?? schedule.specificStartTime ?? "",
    endTime: occ.endTime ?? schedule.specificEndTime ?? "",
    maxCapacity: schedule.maxCapacity,
    currentEnrolled: 0,
    availableSlots: schedule.maxCapacity,
    status: SESSION_STATUS.SCHEDULED,
  }));

  console.log("Session DTOs to Create:", dto);

  const response =
    await ServiceLocator.SessionService.internal.createMultipleSessions(
      dto,
      tx
    );

  console.log("Created Sessions Count:", response);
}
