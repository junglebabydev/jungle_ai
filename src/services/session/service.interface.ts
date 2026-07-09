import { Prisma, Session } from "@prisma/client";
import {
  CreateSessionDTO,
  SessionResponseDTO,
  UpdateSessionDTO,
  UpdateSessionInternalDTO,
} from "../../shared/dtos/SessionDTOs";
import { SessionExtended } from "../../shared/types/session";

export interface ISessionServiceInternal {
  createSession(
    dto: CreateSessionDTO,
    tx?: Prisma.TransactionClient
  ): Promise<Session>;

  createMultipleSessions(
    dto: CreateSessionDTO[],
    tx?: Prisma.TransactionClient
  ): Promise<number>;

  listSessionsByScheduleInRange(
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
    },
    tx?: Prisma.TransactionClient
  ): Promise<SessionExtended[]>;

  listSessionsByProductInRange(
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
    },
    tx?: Prisma.TransactionClient
  ): Promise<SessionExtended[]>;

  getSessionById(
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
    }
  ): Promise<SessionExtended>;

  getSessionByScheduleAndDate(
    scheduleId: string | number,
    date: Date,
    tx?: Prisma.TransactionClient
  ): Promise<SessionResponseDTO>;

  findSessionById(
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
    }
  ): Promise<SessionExtended | null>;

  findSessionByScheduleAndDate(
    scheduleId: string | number,
    date: Date,
    tx?: Prisma.TransactionClient
  ): Promise<Session | null>;

  updateSession(
    dto: UpdateSessionInternalDTO,
    tx?: Prisma.TransactionClient
  ): Promise<Session>;

  cancelSession(
    id: string | number,
    reason?: string,
    tx?: Prisma.TransactionClient
  ): Promise<Session>;
}

export interface ISessionService {
  createSession(dto: CreateSessionDTO): Promise<SessionResponseDTO>;

  createMakeupSession(
    baseSessionId: string | number,
    dto: CreateSessionDTO
  ): Promise<SessionResponseDTO>;

  listSessionsBySchedule(
    scheduleId: string | number,
    range: { from?: Date; to?: Date },
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
  ): Promise<SessionResponseDTO[]>;

  listSessionsByProduct(
    productId: string | number,
    range: { from?: Date; to?: Date },
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
  ): Promise<SessionResponseDTO[]>;

  listSessionsByLocationId(
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
  ): Promise<SessionResponseDTO[]>;

  getSessionById(
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
    }
  ): Promise<SessionResponseDTO>;

  // cancelSession(
  //   id: string | number,
  //   reason?: string
  // ): Promise<SessionResponseDTO>;

  updateSession(dto: UpdateSessionDTO): Promise<SessionResponseDTO>;
}
