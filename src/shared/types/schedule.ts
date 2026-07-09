import { Prisma } from "@prisma/client";

const scheduleWithProductAndLocation =
  Prisma.validator<Prisma.ScheduleDefaultArgs>()({
    include: {
      product: true,
      location: true,
    },
  });

export type ScheduleWithProductAndLocation = Prisma.ScheduleGetPayload<
  typeof scheduleWithProductAndLocation
>;
