import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './exception.filter';
import { ConflictException, NotFoundException } from './app.exception';

/**
 * The single place unknown errors become HTTP responses. Locks down the
 * two things that matter: Prisma "known" errors get real HTTP semantics,
 * and NOTHING unexpected leaks its message to the client.
 */
function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/spec' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] as Record<string, unknown> };
}

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db says no', {
    code,
    clientVersion: 'spec',
    meta,
  });

describe('AllExceptionsFilter', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('passes AppException status / message / errorCode through', () => {
    const { status, body } = run(new NotFoundException('Order not found'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ statusCode: 404, message: 'Order not found' });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('keeps ConflictException as 409', () => {
    expect(run(new ConflictException('dupe')).status).toBe(409);
  });

  it('unwraps Nest HttpException bodies', () => {
    const { status, body } = run(new HttpException({ message: 'nope' }, HttpStatus.I_AM_A_TEAPOT));
    expect(status).toBe(418);
    expect(body.message).toBe('nope');
  });

  describe('Prisma known errors get HTTP semantics', () => {
    it('P2002 unique violation -> 409 naming the fields', () => {
      const { status, body } = run(prismaError('P2002', { target: ['email'] }));
      expect(status).toBe(409);
      expect(body).toMatchObject({ errorCode: 'UNIQUE_CONSTRAINT' });
      expect(body.message).toContain('email');
    });

    it('P2002 without meta still 409s with a generic message', () => {
      const { status, body } = run(prismaError('P2002'));
      expect(status).toBe(409);
      expect(body.errorCode).toBe('UNIQUE_CONSTRAINT');
    });

    it('P2025 record not found -> 404', () => {
      const { status, body } = run(prismaError('P2025'));
      expect(status).toBe(404);
      expect(body.errorCode).toBe('RECORD_NOT_FOUND');
    });

    it('P2003 foreign key -> 409', () => {
      const { status, body } = run(prismaError('P2003'));
      expect(status).toBe(409);
      expect(body.errorCode).toBe('FOREIGN_KEY_CONSTRAINT');
    });

    it('an unmapped Prisma code is an opaque 500 (never leaks the driver message)', () => {
      const { status, body } = run(prismaError('P1000'));
      expect(status).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('db says no');
    });
  });

  it('a raw Error is an opaque 500 - the real message stays server-side', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED postgres:5432 table users'));
    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('postgres');
  });
});
