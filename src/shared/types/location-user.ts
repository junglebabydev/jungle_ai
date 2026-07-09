import { Prisma } from "@prisma/client";

const locationUserWithRole = Prisma.validator<Prisma.LocationUserDefaultArgs>()(
  {
    include: {
      locationRole: true,
    },
  }
);

export type LocationUserWithRole = Prisma.LocationUserGetPayload<
  typeof locationUserWithRole
>;
