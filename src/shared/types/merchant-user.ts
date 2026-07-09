import { Prisma } from "@prisma/client";

const merchantUserWithRole = Prisma.validator<Prisma.MerchantUserDefaultArgs>()(
  {
    include: {
      merchantRole: true,
    },
  }
);

export type MerchantUserWithRole = Prisma.MerchantUserGetPayload<
  typeof merchantUserWithRole
>;
