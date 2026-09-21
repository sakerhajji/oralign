import { Prisma } from '@prisma/client';
import { env } from '../../common/config/env';
import { ClicToPayClient } from './clictopay.client';
import { ClicToPayError } from './clictopay.types';

describe('ClicToPayClient', () => {
  const fetchMock = jest.fn();
  let client: ClicToPayClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.assign(env.clicToPay, {
      apiUrl: 'https://test.example/payment/rest',
      username: 'merchant-user',
      password: 'merchant-password',
      currency: '788',
      returnUrl: 'https://app.example/payment/return',
      failUrl: 'https://app.example/payment/fail',
      timeoutMs: 100,
    });
    client = new ClicToPayClient();
  });

  it('converts TND to millimes exactly', () => {
    expect(ClicToPayClient.amountToMillimes(new Prisma.Decimal('10.000'))).toBe(10000);
  });

  it('preserves the smallest supported TND unit', () => {
    expect(ClicToPayClient.amountToMillimes('0.001')).toBe(1);
  });

  it('rejects amounts with more than three decimal places', () => {
    expect(() => ClicToPayClient.amountToMillimes('1.0001')).toThrow(
      'server-calculated payment amount is invalid',
    );
  });

  it('registers with form encoding and returns the hosted URL', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ orderId: 'provider-1', formUrl: 'https://pay.example/form' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(
      client.register({
        orderNumber: 'ORA-1',
        amount: 10000,
        returnUrl: 'https://app.example/payment/return?p=1',
        failUrl: 'https://app.example/payment/fail?p=1',
      }),
    ).resolves.toEqual({ orderId: 'provider-1', formUrl: 'https://pay.example/form' });
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(String(request.body)).toContain('amount=10000');
    expect(String(request.body)).toContain('currency=788');
  });

  it('maps provider registration errors without exposing credentials', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errorCode: 4 }), { status: 200 }),
    );
    await expect(
      client.register({
        orderNumber: 'ORA-2',
        amount: 10000,
        returnUrl: 'https://app.example/return',
        failUrl: 'https://app.example/fail',
      }),
    ).rejects.toMatchObject({ safeCode: 'PAYMENT_REGISTRATION_REJECTED' });
  });

  it('does not retry an ambiguous registration request', async () => {
    fetchMock.mockRejectedValue(new Error('socket closed'));
    await expect(
      client.register({
        orderNumber: 'ORA-3',
        amount: 10000,
        returnUrl: 'https://app.example/return',
        failUrl: 'https://app.example/fail',
      }),
    ).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts only a structured status response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          orderStatus: 2,
          orderNumber: 'ORA-4',
          amount: 10000,
          currency: 788,
          actionCode: 0,
        }),
        { status: 200 },
      ),
    );
    await expect(client.getStatus({ orderId: 'provider-4' })).resolves.toEqual({
      orderStatus: 2,
      orderNumber: 'ORA-4',
      amount: 10000,
      currency: '788',
      actionCode: 0,
    });
  });

  it('retries status lookups after a transient server failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ orderStatus: 0 }), { status: 200 }),
      );
    await expect(client.getStatus({ orderNumber: 'ORA-5' })).resolves.toMatchObject({
      orderStatus: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed provider status data as ambiguous', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ orderStatus: 'not-a-number' }), { status: 200 }),
    );
    await expect(client.getStatus({ orderId: 'provider-6' })).rejects.toMatchObject({
      safeCode: 'PAYMENT_PROVIDER_RESPONSE_INVALID',
    });
  });

  it('fails safely when provider configuration is missing', async () => {
    Object.assign(env.clicToPay, { username: undefined });
    await expect(client.getStatus({ orderId: 'provider-7' })).rejects.toBeInstanceOf(
      ClicToPayError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
