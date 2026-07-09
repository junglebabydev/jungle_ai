import prisma from "../../config/prisma";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreateSessionDTO,
  mapSessionResponseDTO,
  SessionResponseDTO,
  UpdateSessionDTO,
} from "../../shared/dtos/SessionDTOs";
import { ISessionService } from "./service.interface";
import { SessionServiceInternal } from "./service.internal";
import { SESSION_STATUS } from "@prisma/client";

async function createSession(
  dto: CreateSessionDTO
): Promise<SessionResponseDTO> {
  const session = await SessionServiceInternal.createSession(dto);

  return mapSessionResponseDTO(session);
}

async function createMakeupSession(
  baseSessionId: string | number,
  dto: CreateSessionDTO
): Promise<SessionResponseDTO> {
  const existing = await getSessionById(baseSessionId);
  if (!existing) throw NotFoundError.Session;

  return await createSession(dto);
}

async function listSessionsBySchedule(
  scheduleId: string | number,
  { from, to }: { from?: Date; to?: Date },
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
): Promise<SessionResponseDTO[]> {
  const now = new Date();
  const fromDate = from ?? now;
  const toDate =
    to ?? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const sessions = await SessionServiceInternal.listSessionsByScheduleInRange(
    scheduleId,
    fromDate,
    toDate,
    { withSchedule, withProduct, withLocation, withInstructor }
  );

  return sessions.map((session) =>
    mapSessionResponseDTO(session, {
      schedule: session.schedule,
      product: session.product,
      location: session.location,
      instructor: session.instructor,
    })
  );
}

async function listSessionsByProduct(
  productId: string | number,
  { from, to }: { from?: Date; to?: Date },
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
): Promise<SessionResponseDTO[]> {
  const now = new Date();
  const fromDate = from ?? now;
  const toDate =
    to ?? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const sessions = await SessionServiceInternal.listSessionsByProductInRange(
    productId,
    fromDate,
    toDate,
    { withSchedule, withProduct, withLocation, withInstructor }
  );

  return sessions.map((session) =>
    mapSessionResponseDTO(session, {
      schedule: session.schedule,
      product: session.product,
      location: session.location,
      instructor: session.instructor,
    })
  );
}

async function listSessionsByLocationId(
  locationId: string | number,
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
  }
): Promise<SessionResponseDTO[]> {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        locationId: Number(locationId),
      },
      include: {
        schedule: withSchedule,
        product: withProduct,
        location: withLocation,
        instructor: withInstructor,
      },
    });

    return sessions.map((session) =>
      mapSessionResponseDTO(session, {
        schedule: session.schedule,
        product: session.product,
        location: session.location,
        instructor: session.instructor,
      })
    );
  } catch (e) {
    throw BadRequestError.FetchSession(`locationId: ${locationId}`);
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
): Promise<SessionResponseDTO> {
  const session = await SessionServiceInternal.getSessionById(id, {
    withSchedule,
    withProduct,
    withLocation,
    withInstructor,
  });

  return mapSessionResponseDTO(session, {
    schedule: session.schedule,
    product: session.product,
    location: session.location,
    instructor: session.instructor,
  });
}

async function updateSession(
  dto: UpdateSessionDTO
): Promise<SessionResponseDTO> {
  const { locationId, productId, sessionId, ...updateData } = dto;

  await SessionServiceInternal.updateSession({
    sessionId,
    ...updateData,
    status: updateData.status as SESSION_STATUS | undefined,
  });

  return getSessionById(sessionId, {
    withSchedule: true,
    withProduct: true,
    withLocation: true,
    withInstructor: true,
  });
}

export const SessionService: ISessionService = {
  createSession,
  createMakeupSession,
  listSessionsBySchedule,
  listSessionsByProduct,
  listSessionsByLocationId,
  getSessionById,
  updateSession,
};
