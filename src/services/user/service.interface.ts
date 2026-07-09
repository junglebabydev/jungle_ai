import { Prisma, User } from "@prisma/client";
import { CreateUserDTO, UserResponseDTO } from "../../shared/dtos/UserDTOs";
import { UserWithRole } from "../../shared/types/user";
import { PLATFORM_ROLE } from "../../shared/enums";

export interface IUserServiceInternal {
  createUserInternal(
    dto: CreateUserDTO,
    tx?: Prisma.TransactionClient
  ): Promise<User>;
  findUserByFirebaseId(firebaseId: string): Promise<User | null>;
  getUserById(
    userId: string | number,
    { withRole }: { withRole?: boolean }
  ): Promise<UserWithRole | null>;
  updateEmailVerified(userId: number, emailVerified: boolean): Promise<User>;
  updateEmailVerificationSentAt(userId: number, sentAt: Date): Promise<User>;
}

export interface IUSerService {
  getUserById(
    id: string | number,
    { withRole }: { withRole?: boolean }
  ): Promise<UserResponseDTO>;
  updateUserPlatformRole(
    id: string | number,
    platformRole: PLATFORM_ROLE
  ): Promise<UserResponseDTO>;
}
