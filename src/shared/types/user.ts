import { Prisma } from "@prisma/client";

const userWithRole = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    platformRole: true,
  },
});

export type UserWithRole = Prisma.UserGetPayload<typeof userWithRole>;
