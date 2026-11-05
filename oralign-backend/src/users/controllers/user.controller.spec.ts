import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { StorageService } from '../../storage/storage.interface';
import { UserListQueryDto } from '../dto/user.dto';
import type { UserService } from '../services/user.service';
import { UserController } from './user.controller';

/** The GET routes in declaration order, as Nest's router registers them. */
function getRoutes(): Array<{ method: string; path: string }> {
  const proto = UserController.prototype as unknown as Record<string, object>;
  return Object.getOwnPropertyNames(UserController.prototype)
    .filter((name) => name !== 'constructor')
    .filter(
      (name) =>
        Reflect.getMetadata(METHOD_METADATA, proto[name]) === RequestMethod.GET,
    )
    .map((name) => ({
      method: name,
      path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string,
    }));
}

function makeController(
  service: Partial<Record<keyof UserService, jest.Mock>>,
) {
  return new UserController(
    service as unknown as UserService,
    {} as StorageService,
  );
}

describe('UserController', () => {
  it('declares GET /users/stats BEFORE GET /users/:id (never read as an id)', () => {
    const paths = getRoutes().map((r) => r.path);
    expect(paths).toContain('stats');
    expect(paths.indexOf('stats')).toBeLessThan(paths.indexOf(':id'));
  });

  it('GET /users/stats is admin-only', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(
          UserController.prototype,
          'getUsersStats',
        )?.value as object,
      ),
    ).toEqual([UserRole.admin]);
  });

  it('hands the validated query DTO to the service, for both lists', async () => {
    const getAllUsers = jest.fn().mockResolvedValue({ data: [] });
    const getDeletedUsers = jest.fn().mockResolvedValue({ data: [] });
    const controller = makeController({ getAllUsers, getDeletedUsers });
    const query = Object.assign(new UserListQueryDto(), {
      page: 2,
      limit: 20,
      welcomeGift: 'used' as const,
    });

    await controller.getAllUsers(query);
    await controller.getDeletedUsers(query);

    expect(getAllUsers).toHaveBeenCalledWith(query);
    expect(getDeletedUsers).toHaveBeenCalledWith(query);
  });

  it('create passes the caller so the role can be checked', async () => {
    const createUser = jest.fn().mockResolvedValue({ id: 'u-new' });
    const controller = makeController({ createUser });
    const dto = {
      email: 'a@b.tn',
      fullName: 'A B',
      password: 'P@ssword123',
      role: UserRole.designer,
    };

    await controller.createUser(dto, {
      sub: 'u-admin',
      role: UserRole.admin,
    } as JwtPayload);

    expect(createUser).toHaveBeenCalledWith(dto, {
      userId: 'u-admin',
      role: UserRole.admin,
    });
  });
});
