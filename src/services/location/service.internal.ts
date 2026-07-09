import { Location } from "@prisma/client";
import prisma from "../../config/prisma";
import { ILocationServiceInternal } from "./service.interface";

async function findLocationById(id: string | number): Promise<Location | null> {
  return await prisma.location.findUnique({ where: { id: Number(id) } });
}

async function getDistinctDistricts(): Promise<string[]> {
  const rows = await prisma.location.findMany({
    where: { isActive: true },
    select: { sgDistrict: true },
    distinct: ["sgDistrict"],
  });
  return rows.map((r) => r.sgDistrict).filter((d): d is string => !!d);
}

export const LocationServiceInternal: ILocationServiceInternal = {
  findLocationById,
  getDistinctDistricts,
};
