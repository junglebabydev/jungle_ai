import { Prisma } from "@prisma/client";

const locationExtended = Prisma.validator<Prisma.LocationDefaultArgs>()({
  include: {
    merchant: true,
    details: true,
    operatingHrs: true,
    media: true,
  },
});

export type LocationExtended = Prisma.LocationGetPayload<
  typeof locationExtended
>;
