import prisma from "../../config/prisma";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";
import { NotFoundError } from "../../errors/domains/NotFoundError";
import { mapUserResponseDTO, UserResponseDTO } from "../../shared/dtos/UserDTOs";
import { IUSerService } from "./service.interface";
import { PLATFORM_ROLE } from "../../shared/enums";
import { ServiceLocator } from "..";
import { UserWithRole } from "../../shared/types/user";

//////////////////////////////
// Public Service IMPL
//////////////////////////////

async function getUserById(
  id: string | number,
  { withRole }: { withRole?: boolean },
): Promise<UserResponseDTO> {
  try {
    const user = await _getUserById(id, { withRole });

    return mapUserResponseDTO(user, { role: user.platformRole });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.FetchUser;
  }
}

async function updateUserPlatformRole(
  id: string | number,
  platformRole: PLATFORM_ROLE,
) {
  try {
    const role =
      await ServiceLocator.RoleService.internal.getRoleByName(platformRole);

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: {
        platformRoleId: role.id,
      },
    });

    return mapUserResponseDTO(user, { role });
  } catch (e) {
    if (e instanceof ApplicationError) throw e;
    throw BadRequestError.UpdatePlatformRole;
  }
}

//////////////////////////////
// Exports
//////////////////////////////

export const UserService: IUSerService = {
  getUserById,
  updateUserPlatformRole,
};

//////////////////////////////
// Helper
//////////////////////////////

async function _findUserById(
  id: string | number,
  { withRole }: { withRole?: boolean },
): Promise<UserWithRole | null> {
  return await prisma.user.findUnique({
    where: { id: Number(id) },
    include: { platformRole: withRole },
  });
}

async function _getUserById(
  id: string | number,
  { withRole }: { withRole?: boolean },
): Promise<UserWithRole> {
  try {
    const user = await _findUserById(id, { withRole });
    if (!user) throw NotFoundError.User;

    return user;
  } catch (e) {
    throw BadRequestError.FetchUser;
  }
}
