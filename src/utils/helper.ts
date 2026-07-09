import { Product } from "@prisma/client";
import { z } from "zod";
import { ProductExtended } from "../shared/types/product";

function prismaToZodEnum<T extends Record<string, string>>(prismaEnum: T) {
  return z.enum(Object.values(prismaEnum) as [string, ...string[]]);
}

export function zodToPrismaEnum<T extends Record<string, string>>(
  prismaEnum: T,
  value: string,
): T[keyof T] {
  const enumValues = Object.values(prismaEnum);

  if (!enumValues.includes(value)) {
    throw new Error(
      `Invalid enum value "${value}" for ${Object.keys(prismaEnum).join(", ")}`,
    );
  }

  return value as T[keyof T];
}

function isProductExtended(
  product: Product | ProductExtended,
): product is ProductExtended {
  return "location" in product;
}

export const Helper = {
  prismaToZodEnum,
  zodToPrismaEnum,
  isProductExtended,
};
