import { Prisma, User, USER_STATUS } from "@prisma/client";
import { CreateUserDTO } from "../../shared/dtos/UserDTOs";
import { IUserServiceInternal } from "./service.interface";
import prisma from "../../config/prisma";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { RoleResponseDTO } from "../../shared/dtos/RoleDTOs";
import { UserWithRole } from "../../shared/types/user";
import { ServiceLocator } from "..";
import { PLATFORM_ROLE } from "../../shared/enums";

//////////////////////////////
// Internal Service IMPL
//////////////////////////////

async function createUserInternal(
  dto: CreateUserDTO,
  tx?: Prisma.TransactionClient
): Promise<User> {
  const db = tx ?? prisma;

  try {
    const roleUser = await ServiceLocator.RoleService.internal.getRoleByName(
      PLATFORM_ROLE.USER
    );

    const user = await db.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: USER_STATUS.ACTIVE,
        firebaseId: dto.firebaseId ?? "",
        platformRoleId: roleUser.id,
      },
    });

    return user;
  } catch (e) {
    throw BadRequestError.SignUp;
  }
}

async function findUserByFirebaseId(firebaseId: string): Promise<User | null> {
  return await prisma.user.findFirst({
    where: { firebaseId },
  });
}

async function getUserById(
  userId: string | number,
  { withRole }: { withRole?: boolean }
): Promise<UserWithRole | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: {
        platformRole: withRole,
      },
    });

    return user;
  } catch (e) {
    throw BadRequestError.FetchUser;
  }
}

async function updateEmailVerified(
  userId: number,
  emailVerified: boolean
): Promise<User> {
  return await prisma.user.update({
    where: { id: userId },
    data: { emailVerified },
  });
}

async function updateEmailVerificationSentAt(
  userId: number,
  sentAt: Date
): Promise<User> {
  return await prisma.user.update({
    where: { id: userId },
    data: { emailVerificationSentAt: sentAt },
  });
}

//////////////////////////////
// Exports
//////////////////////////////

export const UserServiceInternal: IUserServiceInternal = {
  createUserInternal,
  findUserByFirebaseId,
  getUserById,
  updateEmailVerified,
  updateEmailVerificationSentAt,
};
