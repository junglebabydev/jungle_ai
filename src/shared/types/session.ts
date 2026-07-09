import { Prisma } from "@prisma/client";

const sessionExtended = Prisma.validator<Prisma.SessionDefaultArgs>()({
  include: {
    schedule: true,
    product: true,
    location: true,
    instructor: true,
  },
});

export type SessionExtended = Prisma.SessionGetPayload<typeof sessionExtended>;
