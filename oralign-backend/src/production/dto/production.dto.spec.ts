import {
  type ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { requestedPerformedAt } from '../production.rules';
import {
  CancelProductionEventDto,
  DeclareProductionEventDto,
  ProductionExportQueryDto,
  ProductionNoticesQueryDto,
  ProductionQueueQueryDto,
  requireIdempotencyKey,
} from './index';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function parser<T>(metatype: new () => T, type: ArgumentMetadata['type']) {
  return (raw: Record<string, unknown>) =>
    pipe.transform(raw, { type, metatype }) as Promise<T>;
}

const declare = parser(DeclareProductionEventDto, 'body');
const cancel = parser(CancelProductionEventDto, 'body');
const queue = parser(ProductionQueueQueryDto, 'query');
const exportCsv = parser(ProductionExportQueryDto, 'query');
const notices = parser(ProductionNoticesQueryDto, 'query');

const ORDER_ID = '3f0c6d1e-8f6a-4a52-9c0e-2b7d4e1a9c11';
const valid = {
  orderId: ORDER_ID,
  type: 'model_printed',
  arch: 'both',
  stepFrom: 1,
  stepTo: 10,
};

describe('DeclareProductionEventDto (POST production/events)', () => {
  it('accepts the three-tap minimum (no date, no quantity, no note)', async () => {
    await expect(declare(valid)).resolves.toMatchObject(valid);
  });

  it('trims the note and turns a blank one into "no note"', async () => {
    expect((await declare({ ...valid, note: '  reprint  ' })).note).toBe(
      'reprint',
    );
    expect((await declare({ ...valid, note: '   ' })).note).toBeUndefined();
  });

  it('performedDay and performedTime come together or not at all', async () => {
    await expect(
      declare({ ...valid, performedDay: '2026-11-25', performedTime: '09:30' }),
    ).resolves.toMatchObject({
      performedDay: '2026-11-25',
      performedTime: '09:30',
    });
    await expect(
      declare({ ...valid, performedDay: '2026-11-25' }),
    ).rejects.toThrow();
    await expect(
      declare({ ...valid, performedTime: '09:30' }),
    ).rejects.toThrow();
  });

  it.each([
    { performedDay: '2026-2-3', performedTime: '09:30' },
    { performedDay: '25/11/2026', performedTime: '09:30' },
    { performedDay: '2026-11-25', performedTime: '9:30' },
    { performedDay: '2026-11-25', performedTime: '07:05:00' },
    { performedDay: 20261125, performedTime: '09:30' },
  ])(
    'refuses a malformed day or time with a plain 400, no code (%j)',
    async (when) => {
      const failure = declare({ ...valid, ...when });
      await expect(failure).rejects.toBeInstanceOf(BadRequestException);
      // The pipe's own 400: no machine code for the client to map.
      await expect(failure).rejects.not.toHaveProperty('errorCode');
    },
  );

  // Well-shaped but nonexistent: the DTO lets it through so the service
  // answers the coded 400 the contract lists (businessInstant).
  it.each([
    [{ performedDay: '2026-02-30', performedTime: '09:30' }, 'INVALID_DATE'],
    [{ performedDay: '2026-13-01', performedTime: '09:30' }, 'INVALID_DATE'],
    [{ performedDay: '2026-11-25', performedTime: '25:00' }, 'INVALID_TIME'],
    [{ performedDay: '2026-11-25', performedTime: '24:00' }, 'INVALID_TIME'],
    [{ performedDay: '2026-11-25', performedTime: '09:60' }, 'INVALID_TIME'],
  ])(
    '%j passes the DTO, then the service answers 400 %s',
    async (when, code) => {
      const dto = await declare({ ...valid, ...when });
      expect(() =>
        requestedPerformedAt(dto.performedDay, dto.performedTime),
      ).toThrow(
        expect.objectContaining({ statusCode: 400, errorCode: code }) as Error,
      );
    },
  );

  it('a delivery needs its recipient; other acts do not', async () => {
    await expect(
      declare({ ...valid, type: 'aligner_delivered' }),
    ).rejects.toThrow();
    await expect(
      declare({ ...valid, type: 'aligner_delivered', deliveredTo: 'courier' }),
    ).resolves.toMatchObject({ deliveredTo: 'courier' });
    await expect(declare(valid)).resolves.toBeDefined();
  });

  it.each([
    { stepFrom: 0 },
    { stepTo: 201 },
    { stepFrom: 1.5 },
    { quantity: 0 },
    { quantity: 501 },
    { arch: 'left' },
    { type: 'aligner_polished' },
    { orderId: 'not-a-uuid' },
    { note: 'x'.repeat(1001) },
    { deliveredToName: 'x'.repeat(121) },
    { confirmWarnings: ['already_declared', 'made_up'] },
    { createdById: 'someone-else' },
  ])('refuses out-of-shape input (%j)', async (bad) => {
    await expect(declare({ ...valid, ...bad })).rejects.toThrow();
  });

  it('carries the confirmed warning codes', async () => {
    await expect(
      declare({ ...valid, note: 'ok', confirmWarnings: ['already_declared'] }),
    ).resolves.toMatchObject({ confirmWarnings: ['already_declared'] });
  });
});

describe('CancelProductionEventDto (PATCH production/events/:id/cancel)', () => {
  it('trims the reason and bounds it to 3-500 characters', async () => {
    expect((await cancel({ reason: '  wrong case ' })).reason).toBe(
      'wrong case',
    );
    await expect(cancel({ reason: '  ab ' })).rejects.toThrow();
    await expect(cancel({ reason: 'x'.repeat(501) })).rejects.toThrow();
    await expect(cancel({})).rejects.toThrow();
  });

  it('reads alsoSibling from the raw value ("false" stays false)', async () => {
    expect(
      (await cancel({ reason: 'typo', alsoSibling: 'false' })).alsoSibling,
    ).toBe(false);
    expect(
      (await cancel({ reason: 'typo', alsoSibling: true })).alsoSibling,
    ).toBe(true);
    expect((await cancel({ reason: 'typo' })).alsoSibling).toBeUndefined();
  });
});

describe('list queries', () => {
  it('queue: tab enum, page / limit as numbers, search trimmed and bounded', async () => {
    await expect(
      queue({ tab: 'done', page: '2', limit: '50', search: '  OA-12 ' }),
    ).resolves.toMatchObject({
      tab: 'done',
      page: 2,
      limit: 50,
      search: 'OA-12',
    });
    expect((await queue({ search: '   ' })).search).toBeUndefined();
    await expect(queue({ limit: '101' })).rejects.toThrow();
    await expect(queue({ tab: 'all' })).rejects.toThrow();
    await expect(queue({ search: 'x'.repeat(121) })).rejects.toThrow();
  });

  it('export: real calendar days and a known format', async () => {
    await expect(
      exportCsv({ from: '2026-11-01', to: '2026-11-30', format: 'daily' }),
    ).resolves.toMatchObject({ format: 'daily' });
    await expect(
      exportCsv({ from: '2026-11-31', to: '2026-12-01' }),
    ).rejects.toThrow();
    await expect(exportCsv({ from: '2026-11-01' })).rejects.toThrow();
  });

  it('notices: exhausted is read from the raw value ("false" stays false)', async () => {
    expect((await notices({ exhausted: 'true' })).exhausted).toBe(true);
    expect((await notices({ exhausted: 'false' })).exhausted).toBe(false);
    expect((await notices({})).exhausted).toBeUndefined();
    expect((await notices({ exhausted: '' })).exhausted).toBeUndefined();
    await expect(
      notices({ status: 'failed', exhausted: 'true', page: '1', limit: '1' }),
    ).resolves.toMatchObject({
      status: 'failed',
      exhausted: true,
      page: 1,
      limit: 1,
    });
    await expect(notices({ exhausted: 'yes' })).rejects.toThrow();
    await expect(notices({ exhausted: '1' })).rejects.toThrow();
  });
});

describe('requireIdempotencyKey', () => {
  it('returns a well-formed key', () => {
    expect(requireIdempotencyKey(' tap-2026-11-25-abcd ')).toBe(
      'tap-2026-11-25-abcd',
    );
  });

  it.each([
    undefined,
    '',
    'short',
    'has space in it',
    'x'.repeat(129),
    'semi;colon',
  ])('refuses %p with 400 PRODUCTION_IDEMPOTENCY_KEY_REQUIRED', (raw) => {
    let thrown: unknown;
    try {
      requireIdempotencyKey(raw);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      statusCode: 400,
      errorCode: 'PRODUCTION_IDEMPOTENCY_KEY_REQUIRED',
    });
  });
});
