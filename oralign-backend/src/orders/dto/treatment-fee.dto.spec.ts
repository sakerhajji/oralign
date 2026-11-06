import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import {
  TreatmentFeeFilterDto,
  TreatmentFeeQueueQueryDto,
} from './treatment-fee.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const query: ArgumentMetadata = {
  type: 'query',
  metatype: TreatmentFeeFilterDto,
};
const parse = (raw: Record<string, unknown>) =>
  pipe.transform(raw, query) as Promise<TreatmentFeeFilterDto>;

const badRequest = { status: 400 };

describe('TreatmentFeeFilterDto (GET /orders/admin/treatment-fees query)', () => {
  it('accepts no param at all (page 1 of 25 is the service default)', async () => {
    await expect(parse({})).resolves.toEqual({});
  });

  it('reads page and limit as integers', async () => {
    await expect(parse({ page: '2', limit: '50' })).resolves.toMatchObject({
      page: 2,
      limit: 50,
    });
  });

  it.each([
    { page: 'abc' },
    { page: '0' },
    { page: '1.5' },
    { limit: '0' },
    { limit: '101' },
  ])('refuses %p with a 400 (never a NaN reaching Prisma)', async (raw) => {
    await expect(parse(raw)).rejects.toMatchObject(badRequest);
  });

  it('reads methods and statuses comma-separated or repeated', async () => {
    await expect(
      parse({
        methods: 'card, bank_transfer',
        statuses: 'awaiting_confirmation',
      }),
    ).resolves.toMatchObject({
      methods: ['card', 'bank_transfer'],
      statuses: ['awaiting_confirmation'],
    });
    await expect(
      parse({
        methods: ['cash', 'card'],
        statuses: ['success', 'awaiting_confirmation'],
      }),
    ).resolves.toMatchObject({
      methods: ['cash', 'card'],
      statuses: ['success', 'awaiting_confirmation'],
    });
  });

  it.each([{ methods: 'cheque' }, { statuses: 'paid' }])(
    'refuses an unknown method or status (%p)',
    async (raw) => {
      await expect(parse(raw)).rejects.toMatchObject(badRequest);
    },
  );

  it.each([
    ['paidAt', 'asc'],
    ['amount', 'desc'],
  ])('accepts sortBy=%s with sortOrder=%s', async (sortBy, sortOrder) => {
    await expect(parse({ sortBy, sortOrder })).resolves.toMatchObject({
      sortBy,
      sortOrder,
    });
  });

  it.each([{ sortBy: 'createdAt' }, { sortOrder: 'up' }])(
    'refuses %p',
    async (raw) => {
      await expect(parse(raw)).rejects.toMatchObject(badRequest);
    },
  );

  it('trims the search, drops a blank one and refuses one over 120 characters', async () => {
    await expect(parse({ search: '  TF-000042 ' })).resolves.toMatchObject({
      search: 'TF-000042',
    });
    expect((await parse({ search: ' ' })).search).toBeUndefined();
    await expect(parse({ search: 'x'.repeat(121) })).rejects.toMatchObject(
      badRequest,
    );
  });

  it('accepts a period of paid days and a dentist', async () => {
    await expect(
      parse({ from: '2026-11-01', to: '2026-11-06', doctorId: 'u-doc' }),
    ).resolves.toMatchObject({
      from: '2026-11-01',
      to: '2026-11-06',
      doctorId: 'u-doc',
    });
  });

  it.each(['2026-02-30', '2026-11-6', 'yesterday'])(
    'refuses the date %s',
    async (value) => {
      await expect(parse({ from: value })).rejects.toMatchObject(badRequest);
      await expect(parse({ to: value })).rejects.toMatchObject(badRequest);
    },
  );

  it('refuses a param it does not know', async () => {
    await expect(parse({ purpose: 'treatment_fee' })).rejects.toMatchObject(
      badRequest,
    );
  });
});

describe('TreatmentFeeQueueQueryDto (GET /orders/admin/treatment-fees/pending query)', () => {
  const parseQueue = (raw: Record<string, unknown>) =>
    pipe.transform(raw, {
      type: 'query',
      metatype: TreatmentFeeQueueQueryDto,
    }) as Promise<TreatmentFeeQueueQueryDto>;

  it('accepts no param at all, and reads page and limit as integers', async () => {
    await expect(parseQueue({})).resolves.toEqual({});
    await expect(parseQueue({ page: '2', limit: '20' })).resolves.toMatchObject(
      { page: 2, limit: 20 },
    );
  });

  it.each([
    { page: 'abc' },
    { page: '0' },
    { page: '1.5' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'all' },
  ])('refuses %p with a 400 (never a NaN reaching Prisma)', async (raw) => {
    await expect(parseQueue(raw)).rejects.toMatchObject(badRequest);
  });

  it('refuses a param it does not know: the queue has no filter', async () => {
    await expect(parseQueue({ search: 'Sarah' })).rejects.toMatchObject(
      badRequest,
    );
  });
});
