import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { PaymentFilterDto, PaymentSummaryQueryDto } from './payment.dto';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const filterQuery: ArgumentMetadata = {
  type: 'query',
  metatype: PaymentFilterDto,
};
const parseFilter = (raw: Record<string, unknown>) =>
  pipe.transform(raw, filterQuery) as Promise<PaymentFilterDto>;

const summaryQuery: ArgumentMetadata = {
  type: 'query',
  metatype: PaymentSummaryQueryDto,
};
const parseSummary = (raw: Record<string, unknown>) =>
  pipe.transform(raw, summaryQuery) as Promise<PaymentSummaryQueryDto>;

const badRequest = { status: 400 };

describe('PaymentFilterDto (GET /admin/payments, GET /payments/mine)', () => {
  it.each(['installment', 'treatment_fee'])(
    'accepts purpose=%s',
    async (purpose) => {
      await expect(parseFilter({ purpose })).resolves.toMatchObject({
        purpose,
      });
    },
  );

  it('refuses any other purpose', async () => {
    await expect(parseFilter({ purpose: 'fee' })).rejects.toMatchObject(
      badRequest,
    );
  });

  it('accepts a period of calendar days', async () => {
    await expect(
      parseFilter({ from: '2026-11-01', to: '2026-11-06' }),
    ).resolves.toMatchObject({ from: '2026-11-01', to: '2026-11-06' });
  });

  it.each(['2026-02-30', '2026-11-6', '06/11/2026', '2026-11-06T10:00:00Z'])(
    'refuses %s as from or to, with a 400 naming the field',
    async (value) => {
      await expect(parseFilter({ from: value })).rejects.toMatchObject({
        status: 400,
        response: {
          message: ['from must be an existing date written YYYY-MM-DD'],
        },
      });
      await expect(parseFilter({ to: value })).rejects.toMatchObject(
        badRequest,
      );
    },
  );

  it('reads a blank date as no bound', async () => {
    const dto = await parseFilter({ from: '  ', to: '' });
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it('leaves from after to to the service, whose 400 carries INVALID_DATE_RANGE', async () => {
    await expect(
      parseFilter({ from: '2026-11-07', to: '2026-11-06' }),
    ).resolves.toMatchObject({ from: '2026-11-07', to: '2026-11-06' });
  });

  it('still accepts the deprecated createdFrom / createdTo', async () => {
    await expect(
      parseFilter({ createdFrom: '2025-01-01', createdTo: '2025-12-31' }),
    ).resolves.toMatchObject({
      createdFrom: '2025-01-01',
      createdTo: '2025-12-31',
    });
  });

  it('reads methods and statuses comma-separated or repeated', async () => {
    await expect(
      parseFilter({ methods: 'card,cash', statuses: ['success', 'pending'] }),
    ).resolves.toMatchObject({
      methods: ['card', 'cash'],
      statuses: ['success', 'pending'],
    });
  });

  it('trims the search, drops a blank one and refuses one over 120 characters', async () => {
    await expect(
      parseFilter({ search: '  1 500,000  ' }),
    ).resolves.toMatchObject({ search: '1 500,000' });
    expect((await parseFilter({ search: '   ' })).search).toBeUndefined();
    await expect(
      parseFilter({ search: 'x'.repeat(121) }),
    ).rejects.toMatchObject(badRequest);
  });

  it('refuses a param it does not know (the old `method` alias)', async () => {
    await expect(parseFilter({ method: 'card' })).rejects.toMatchObject(
      badRequest,
    );
  });

  it.each(['createdAt', 'paidAt', 'amount', 'status', 'eventAt'])(
    'accepts sortBy=%s',
    async (sortBy) => {
      await expect(
        parseFilter({ sortBy, sortOrder: 'asc' }),
      ).resolves.toMatchObject({ sortBy, sortOrder: 'asc' });
    },
  );

  it('refuses a sort it does not know', async () => {
    await expect(parseFilter({ sortBy: 'date' })).rejects.toMatchObject(
      badRequest,
    );
  });
});

describe('PaymentSummaryQueryDto (GET /payments/summary)', () => {
  it('accepts a period and a dentist', async () => {
    await expect(
      parseSummary({ from: '2026-11-01', to: '2026-11-06', doctorId: 'u-doc' }),
    ).resolves.toMatchObject({
      from: '2026-11-01',
      to: '2026-11-06',
      doctorId: 'u-doc',
    });
  });

  it('accepts nothing at all: the service then sums today', async () => {
    const dto = await parseSummary({});
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it.each(['2026-02-29', '2026-11-6', 'today'])(
    'refuses the date %s',
    async (value) => {
      await expect(parseSummary({ from: value })).rejects.toMatchObject(
        badRequest,
      );
      await expect(parseSummary({ to: value })).rejects.toMatchObject(
        badRequest,
      );
    },
  );

  it.each([{ purpose: 'installment' }, { search: 'x' }, { page: '1' }])(
    'refuses a list filter: the takings follow only the period and the dentist (%p)',
    async (raw) => {
      await expect(parseSummary(raw)).rejects.toMatchObject(badRequest);
    },
  );
});
