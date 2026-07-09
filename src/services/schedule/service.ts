import { Prisma, SCHEDULE_STATUS } from "@prisma/client";
import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import {
  CreateScheduleDTO,
  mapScheduleResponseDTO,
  ScheduleResponseDTO,
  UpdateScheduleDTO,
} from "../../shared/dtos/ScheduleDTOs";
import { IScheduleService } from "./service.interface";
import { ScheduleServiceInternal } from "./service.internal";
import { ServiceLocator } from "..";

async function createSchedule(
  productId: number,
  locationId: number,
  dto: CreateScheduleDTO
): Promise<ScheduleResponseDTO> {
  const schedule = await ScheduleServiceInternal.createSchedule(
    productId,
    locationId,
    dto
  );

  // Published schedules feed the product's search doc (day/time-of-day facets),
  // so a new schedule must reindex the parent product. Fire-and-forget; the
  // periodic reconcile is the backstop.
  void ServiceLocator.ProductService.internal.reindexForSearch(productId);

  return mapScheduleResponseDTO(schedule);
}

async function listSchedulesByProduct(
  productId: string | number,
  {
    withProduct,
    withLocation,
  }: { withProduct?: boolean; withLocation?: boolean } = {}
): Promise<ScheduleResponseDTO[]> {
  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        productId: Number(productId),
      },
      include: {
        product: withProduct,
        location: withLocation,
      },
    });

    return schedules.map((schedule) =>
      mapScheduleResponseDTO(schedule, {
        product: schedule.product,
        location: schedule.location,
      })
    );
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSchedule(`productId: ${productId}`);
  }
}

async function getScheduleById(
  id: string | number,
  {
    withProduct,
    withLocation,
  }: { withProduct?: boolean; withLocation?: boolean } = {}
): Promise<ScheduleResponseDTO> {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        product: withProduct,
        location: withLocation,
      },
    });
    if (!schedule) throw NotFoundError.Schedule;

    return mapScheduleResponseDTO(schedule, {
      product: schedule.product,
      location: schedule.location,
    });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchSchedule(`id: ${id}`);
  }
}

async function updateSchedule(
  id: string | number,
  productId: string | number,
  dto: UpdateScheduleDTO
): Promise<ScheduleResponseDTO> {
  try {
    const existing = await getScheduleById(id);

    const updated = await prisma.schedule.update({
      where: { id: Number(id), productId: Number(productId) },
      data: {
        ...dto,
        status: (dto.status as SCHEDULE_STATUS) ?? existing.status,
      },
    });

    // A schedule change shifts the product's day/time-of-day search facets, so
    // reindex the parent product. Fire-and-forget; reconcile backstop.
    void ServiceLocator.ProductService.internal.reindexForSearch(productId);

    return mapScheduleResponseDTO(updated);
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdateSchedule;
  }
}

export const ScheduleService: IScheduleService = {
  createSchedule,
  listSchedulesByProduct,
  getScheduleById,
  updateSchedule,
};
