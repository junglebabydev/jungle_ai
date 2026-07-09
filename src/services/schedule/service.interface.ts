import { Prisma, Schedule } from "@prisma/client";
import {
  CreateScheduleDTO,
  ScheduleResponseDTO,
  UpdateScheduleDTO,
} from "../../shared/dtos/ScheduleDTOs";
import { ScheduleWithProductAndLocation } from "../../shared/types/schedule";

export interface IScheduleServiceInternal {
  createSchedule(
    productId: number,
    locationId: number,
    dto: CreateScheduleDTO,
    tx?: Prisma.TransactionClient
  ): Promise<Schedule>;

  getScheduleById(
    id: number,
    opts?: { withProduct?: boolean; withLocation?: boolean },
    tx?: Prisma.TransactionClient
  ): Promise<ScheduleWithProductAndLocation>;
}

export interface IScheduleService {
  createSchedule(
    productId: number,
    locationId: number,
    dto: CreateScheduleDTO
  ): Promise<ScheduleResponseDTO>;

  listSchedulesByProduct(
    productId: string | number,
    {
      withProduct,
      withLocation,
    }: { withProduct?: boolean; withLocation?: boolean }
  ): Promise<ScheduleResponseDTO[]>;

  getScheduleById(
    id: string | number,
    {
      withProduct,
      withLocation,
    }: { withProduct?: boolean; withLocation?: boolean }
  ): Promise<ScheduleResponseDTO>;

  updateSchedule(
    id: string | number,
    productId: string | number,
    dto: UpdateScheduleDTO
  ): Promise<ScheduleResponseDTO>;
}
