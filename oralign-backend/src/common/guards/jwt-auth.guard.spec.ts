import {
  Controller,
  type ExecutionContext,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PasswordChangeGuard } from '../../auth/guards/password-change.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AllExceptionsFilter } from '../exceptions/exception.filter';
import { RolesGuard } from './roles.guard';

const SECRET = 'test-secret-for-jwt-auth-guard-spec';
process.env.JWT_SECRET ??= SECRET;

// Required after the secret is set: the strategy reads it at construction.
/* eslint-disable @typescript-eslint/no-require-imports */
const { JwtStrategy } =
  require('../../auth/strategies/jwt.strategy') as typeof import('../../auth/strategies/jwt.strategy');
const { JwtAuthGuard } =
  require('./jwt-auth.guard') as typeof import('./jwt-auth.guard');
/* eslint-enable @typescript-eslint/no-require-imports */

// Each strategy built below warns that the test secret is a placeholder.
let quiet: jest.SpyInstance;
beforeAll(() => {
  quiet = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => quiet.mockRestore());

/**
 * The guard is global AND repeated by the controllers' own
 * @UseGuards(JwtAuthGuard, RolesGuard): a request must cost ONE user
 * lookup, never trusting a `req.user` the guard did not set itself.
 * Real passport, real JwtStrategy and real tokens; only Prisma is mocked.
 */

const userRow = (over: Record<string, unknown> = {}) => ({
  email: 'admin@oralign.test',
  role: UserRole.admin,
  isActive: true,
  deletedAt: null,
  tokenVersion: 0,
  mustChangePassword: false,
  ...over,
});

function makePrisma(row = userRow()) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(row) },
  };
}

const token = (claims: Record<string, unknown> = {}) =>
  new JwtService({ secret: process.env.JWT_SECRET }).sign({
    sub: 'u-admin',
    email: 'admin@oralign.test',
    role: UserRole.admin,
    tv: 0,
    ...claims,
  });

type FakeRequest = {
  headers: Record<string, string>;
  user?: unknown;
};

const bearer = (value = token()): FakeRequest => ({
  headers: { authorization: `Bearer ${value}` },
});

function httpContext(
  req: FakeRequest,
  handler: () => void = () => undefined,
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class Route {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let guard: InstanceType<typeof JwtAuthGuard>;

  beforeEach(() => {
    prisma = makePrisma();
    // Registers the 'jwt' strategy with passport, over the previous one.
    new JwtStrategy(prisma as unknown as PrismaService);
    guard = new JwtAuthGuard(new Reflector());
  });

  it('two passes on the same request validate the token once', async () => {
    const req = bearer();
    const context = httpContext(req);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const principal = req.user;
    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(req.user).toBe(principal);
    expect(req.user).toMatchObject({ sub: 'u-admin', role: UserRole.admin });
  });

  it('a fresh request is validated again (the mark lives on one request only)', async () => {
    await guard.canActivate(httpContext(bearer()));
    await guard.canActivate(httpContext(bearer()));

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('never trusts a req.user it did not set: it validates and replaces it', async () => {
    const req = bearer();
    req.user = { sub: 'u-admin', role: UserRole.super_admin };

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    // The role comes from the row, never from what was planted.
    expect(req.user).toMatchObject({ role: UserRole.admin });
  });

  it('a user swapped after the first pass is validated again', async () => {
    const req = bearer();
    const context = httpContext(req);
    await guard.canActivate(context);

    req.user = { sub: 'u-admin', role: UserRole.super_admin };
    await guard.canActivate(context);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(req.user).toMatchObject({ role: UserRole.admin });
  });

  it('a planted req.user without a token is still a 401', async () => {
    const req: FakeRequest = {
      headers: {},
      user: { sub: 'u-admin', role: UserRole.admin },
    };

    await expect(guard.canActivate(httpContext(req))).rejects.toMatchObject({
      status: 401,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('an account blocked since the token was issued is refused on its first pass', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ isActive: false }));
    const req = bearer();

    await expect(guard.canActivate(httpContext(req))).rejects.toMatchObject({
      status: 401,
    });
    // Nothing marked: a second pass validates (and refuses) again.
    await expect(guard.canActivate(httpContext(req))).rejects.toMatchObject({
      status: 401,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('the mark is invisible: a non-enumerable symbol, never copied along', async () => {
    const req = bearer();
    await guard.canActivate(httpContext(req));

    const marks = Object.getOwnPropertySymbols(req);
    expect(marks).toHaveLength(1);
    expect(Object.getOwnPropertyDescriptor(req, marks[0])).toMatchObject({
      enumerable: false,
      writable: false,
    });
    expect(Object.getOwnPropertySymbols({ ...req })).toHaveLength(0);
  });

  it('a @Public route passes without a token and without a lookup', async () => {
    const open = () => undefined;
    Public()(open); // the metadata @Public() puts on a handler
    const req: FakeRequest = { headers: {} };

    await expect(guard.canActivate(httpContext(req, open))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

@Controller('probe')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProbeController {
  @Get('admin')
  @Roles(UserRole.admin)
  admin() {
    return { ok: true };
  }

  @Get('open')
  @Public()
  open() {
    return { open: true };
  }
}

/** As app.module.ts wires it: global JwtAuthGuard, then PasswordChangeGuard. */
describe('JwtAuthGuard over HTTP, global and repeated on the controller', () => {
  let app: INestApplication<App>;
  const prismaMock = makePrisma();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        {
          provide: JwtStrategy,
          useFactory: () =>
            new JwtStrategy(prismaMock as unknown as PrismaService),
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaMock.user.findUnique.mockReset().mockResolvedValue(userRow());
  });

  const get = (url: string, value = token()) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${value}`);

  it('one user lookup per request, not one per guard', async () => {
    const res = await get('/probe/admin');

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('the roles still come from the row: a demoted account is a 403', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userRow({ role: UserRole.dentist }),
    );

    const res = await get('/probe/admin');

    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('PasswordChangeGuard still runs on the global pass: a temporary password is a 403', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userRow({ mustChangePassword: true }),
    );

    const res = await get('/probe/admin');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ errorCode: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('a revoked session is a 401', async () => {
    const res = await get('/probe/admin', token({ tv: 1 }));

    expect(res.status).toBe(401);
  });

  it('@Public still needs no token', async () => {
    const res = await request(app.getHttpServer()).get('/probe/open');

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
