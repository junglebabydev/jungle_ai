import { ISessionServiceInternal } from "./service.interface";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { SessionExtended } from "../../shared/types/session";
import {
  CreateSessionDTO,
  UpdateSessionInternalDTO,
} from "../../shared/dtos/SessionDTOs";
import { Prisma, Session, SESSION_STATUS } from "@prisma/client";

async function createSession(
  dto: CreateSessionDTO,
  tx?: Prisma.TransactionClient
): Promise<Session> {
  const db = tx ?? prisma;

  try {
    return await db.session.create({
      data: {
        scheduleId: dto.scheduleId,
        productId: dto.productId,
        locationId: dto.locationId,
        instructorId: dto.instructorId,
        name: dto.name,
        sessionDate: dto.sessionDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxCapacity: dto.maxCapacity,
        currentEnrolled: dto.currentEnrolled,
        availableSlots: dto.availableSlots,
        status: dto.status as SESSION_STATUS,
        isCancelled: false,
        cancelledAt: undefined,
        cancellationReason: undefined,
        roomOverride: dto.roomOverride,
        sessionNotes: dto.sessionNotes,
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateSession;
  }
}

async function createMultipleSessions(
  dto: CreateSessionDTO[],
  tx?: Prisma.TransactionClient
): Promise<number> {
  const db = tx ?? prisma;

  try {
    const response = await db.session.createMany({
      data: dto.map((session) => ({
        scheduleId: session.scheduleId,
        productId: session.productId,
        locationId: session.locationId,
        instructorId: session.instructorId,
        name: session.name,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        maxCapacity: session.maxCapacity,
        currentEnrolled: session.currentEnrolled,
        availableSlots: session.availableSlots,
        status: session.status as SESSION_STATUS,
        isCancelled: false,
        cancelledAt: undefined,
        cancellationReason: undefined,
        roomOverride: session.roomOverride,
        sessionNotes: session.sessionNotes,
      })),
    });

    return response.count;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CreateSession;
  }
}

async function listSessionsByScheduleInRange(
  scheduleId: string | number,
  from: Date,
  to: Date,
  {
    withSchedule,
    withProduct,
    withLocation,
    withInstructor,
  }: {
    withSchedule?: boolean;
    withProduct?: boolean;
    withLocation?: boolean;
    withInstructor?: boolean;
  } = {},
  tx?: Prisma.TransactionClient
): Promise<SessionExtended[]> {
  const db = tx ?? prisma;

  try {
    const sessions = await db.session.findMany({
      where: {
        scheduleId: Number(scheduleId),
        sessionDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        schedule: withSchedule,
        product: withProduct,
        location: withLocation,
        instructor: withInstructor,
      },
    });

    return sessions;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSession(`scheduleId: ${scheduleId}`);
  }
}

async function listSessionsByProductInRange(
  productId: string | number,
  from: Date,
  to: Date,
  {
    withSchedule,
    withProduct,
    withLocation,
    withInstructor,
  }: {
    withSchedule?: boolean;
    withProduct?: boolean;
    withLocation?: boolean;
    withInstructor?: boolean;
  } = {},
  tx?: Prisma.TransactionClient
): Promise<SessionExtended[]> {
  const db = tx ?? prisma;

  try {
    const sessions = await db.session.findMany({
      where: {
        productId: Number(productId),
        sessionDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        schedule: withSchedule,
        product: withProduct,
        location: withLocation,
        instructor: withInstructor,
      },
    });

    return sessions;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSession(`productId: ${productId}`);
  }
}

async function getSessionById(
  id: string | number,
  {
    withSchedule,
    withProduct,
    withLocation,
    withInstructor,
  }: {
    withSchedule?: boolean;
    withProduct?: boolean;
    withLocation?: boolean;
    withInstructor?: boolean;
  } = {}
): Promise<SessionExtended> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: Number(id) },
      include: {
        schedule: withSchedule,
        product: withProduct,
        location: withLocation,
        instructor: withInstructor,
      },
    });
    if (!session) throw NotFoundError.Session;

    return session;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSession(`id: ${id}`);
  }
}

async function findSessionById(
  id: string | number,
  {
    withSchedule,
    withProduct,
    withLocation,
    withInstructor,
  }: {
    withSchedule?: boolean;
    withProduct?: boolean;
    withLocation?: boolean;
    withInstructor?: boolean;
  } = {}
): Promise<SessionExtended | null> {
  return await prisma.session.findUnique({
    where: { id: Number(id) },
    include: {
      schedule: withSchedule,
      product: withProduct,
      location: withLocation,
      instructor: withInstructor,
    },
  });
}

async function findSessionByScheduleAndDate(
  scheduleId: string | number,
  date: Date,
  tx?: Prisma.TransactionClient
): Promise<Session | null> {
  const db = tx ?? prisma;

  return await db.session.findFirst({
    where: {
      scheduleId: Number(scheduleId),
      sessionDate: date,
    },
  });
}

async function getSessionByScheduleAndDate(
  scheduleId: string | number,
  date: Date,
  tx?: Prisma.TransactionClient
): Promise<Session> {
  const db = tx ?? prisma;
  try {
    const session = await findSessionByScheduleAndDate(scheduleId, date, tx);
    if (!session) throw NotFoundError.Session;

    return session;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSession(`scheduleId: ${scheduleId}`);
  }
}

async function updateSession(
  dto: UpdateSessionInternalDTO,
  tx?: Prisma.TransactionClient
): Promise<Session> {
  const db = tx ?? prisma;

  try {
    // Verify session exists
    await getSessionById(dto.sessionId, {
      withSchedule: false,
      withProduct: false,
      withLocation: false,
      withInstructor: false,
    });

    const updateData: any = {};
    if (dto.instructorId !== undefined)
      updateData.instructorId = dto.instructorId;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.sessionDate !== undefined) updateData.sessionDate = dto.sessionDate;
    if (dto.startTime !== undefined) updateData.startTime = dto.startTime;
    if (dto.endTime !== undefined) updateData.endTime = dto.endTime;
    if (dto.maxCapacity !== undefined) updateData.maxCapacity = dto.maxCapacity;
    if (dto.currentEnrolled !== undefined)
      updateData.currentEnrolled = dto.currentEnrolled;
    if (dto.availableSlots !== undefined)
      updateData.availableSlots = dto.availableSlots;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.roomOverride !== undefined)
      updateData.roomOverride = dto.roomOverride;
    if (dto.sessionNotes !== undefined)
      updateData.sessionNotes = dto.sessionNotes;

    const session = await db.session.update({
      where: { id: dto.sessionId },
      data: updateData,
    });

    return session;
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateSession;
  }
}

async function cancelSession(
  id: string | number,
  reason?: string,
  tx?: Prisma.TransactionClient
): Promise<Session> {
  const db = prisma ?? tx;

  try {
    return await db.session.update({
      where: { id: Number(id) },
      data: {
        status: SESSION_STATUS.CANCELLED,
        isCancelled: true,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.CancelSession;
  }
}

export const SessionServiceInternal: ISessionServiceInternal = {
  createSession,
  createMultipleSessions,
  listSessionsByScheduleInRange,
  listSessionsByProductInRange,
  getSessionById,
  findSessionById,
  findSessionByScheduleAndDate,
  getSessionByScheduleAndDate,
  updateSession,
  cancelSession,
};
