import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../../common/exceptions/exception.filter';
import {
  ACCOUNT_DORMANT_MESSAGE,
  accountDormantError,
  assertNotDormant,
} from './doctor-ordering.policy';

/**
 * The 403 a dormant doctor's order create / submit answers, as the client
 * receives it (P-E): the body carries `errorCode: ACCOUNT_DORMANT`, so the
 * frontend translates the refusal (FR / EN) and refreshes its gates
 * instead of showing the French server message.
 */
function respond(exception: unknown) {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest
    .fn<{ json: typeof json }, [number]>()
    .mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/orders' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return {
    status: status.mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0],
  };
}

describe('ACCOUNT_DORMANT over HTTP', () => {
  it('is a 403 whose body carries the errorCode (the message may stay French)', () => {
    const { status, body } = respond(accountDormantError());
    expect(status).toBe(403);
    expect(body).toMatchObject({
      statusCode: 403,
      errorCode: 'ACCOUNT_DORMANT',
      message: ACCOUNT_DORMANT_MESSAGE,
    });
  });

  it('the guard every ordering path calls throws that very refusal', () => {
    let thrown: unknown;
    try {
      assertNotDormant({ inactiveSince: new Date('2026-11-01T00:00:00Z') });
    } catch (error) {
      thrown = error;
    }
    expect(respond(thrown).body).toMatchObject({
      statusCode: 403,
      errorCode: 'ACCOUNT_DORMANT',
    });
  });
});
