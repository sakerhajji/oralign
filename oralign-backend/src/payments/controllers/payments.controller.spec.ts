import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserRole } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AllExceptionsFilter } from '../../common/exceptions/exception.filter';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. These routes never reach it.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import { ClicToPayPaymentsService } from '../services/clictopay-payments.service';
import { PaymentPractitionersService } from '../services/payment-practitioners.service';
import { PaymentsService } from '../services/payments.service';
import { PaymentsSummaryService } from '../services/payments-summary.service';
import { PaymentsController } from './payments.controller';

const asUser = (sub: string, role: UserRole) =>
  ({ sub, role, email: `${sub}@example.com` }) as JwtPayload;

/**
 * The real controller, pipe, guards' roles check and exception filter, as
 * main.ts wires them; only the JWT check is replaced by a fixed caller and
 * Prisma by mocks. Proves how the URL resolves, not just the handler.
 */
describe('PaymentsController over HTTP', () => {
  let app: INestApplication<App>;
  let caller = asUser('u-doc', UserRole.dentist);
  const paymentGroupBy = jest.fn();
  const orderGroupBy = jest.fn();
  const listPayments = jest.fn();
  const declareBankTransfer = jest.fn();
  const recordCash = jest.fn();
  const findUsers = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsSummaryService,
        PaymentPractitionersService,
        {
          provide: PrismaService,
          useValue: {
            payment: { groupBy: paymentGroupBy },
            dentalOrder: { groupBy: orderGroupBy },
            user: { findMany: findUsers },
          },
        },
        {
          provide: PaymentsService,
          useValue: { listPayments, declareBankTransfer, recordCash },
        },
        { provide: ClicToPayPaymentsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: JwtPayload }>().user =
            caller;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    caller = asUser('u-doc', UserRole.dentist);
    paymentGroupBy.mockReset().mockResolvedValue([]);
    orderGroupBy.mockReset().mockResolvedValue([]);
    listPayments.mockReset().mockResolvedValue({ data: [], total: 0 });
    declareBankTransfer.mockReset().mockResolvedValue(withheldPayment);
    recordCash.mockReset().mockResolvedValue(withheldPayment);
    findUsers.mockReset().mockResolvedValue([]);
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);
  const post = (url: string) => request(app.getHttpServer()).post(url);

  /**
   * A payment as Prisma returns it: Decimals, an installment of 1 000 with
   * the 1 TND stamp on top and a 1 % retenue kept back (991 cash).
   */
  const withheldPayment = {
    id: 'p-1',
    amount: new Prisma.Decimal('991.000'),
    withholdingRate: new Prisma.Decimal('1.00'),
    withholdingAmount: new Prisma.Decimal('10.000'),
    stampAmount: new Prisma.Decimal('1.000'),
  };

  describe('POST declare-bank-transfer (multipart)', () => {
    const url = '/api/quotations/q-1/installments/i-1/declare-bank-transfer';

    it.each([
      ['false', false],
      ['true', true],
    ])(
      'reads applyWithholding=%s from the raw field (no implicit "false" → true)',
      async (raw, expected) => {
        const res = await post(url).field('applyWithholding', raw);
        expect(res.status).toBe(200);
        expect(declareBankTransfer).toHaveBeenCalledWith(
          expect.objectContaining({ applyWithholding: expected }),
        );
      },
    );

    it('no field: the retenue is not applied', async () => {
      const res = await post(url).field('bankReference', 'TRF-1');
      expect(res.status).toBe(200);
      expect(declareBankTransfer.mock.calls[0][0].applyWithholding).toBeUndefined();
    });

    it('anything but true / false is a 400', async () => {
      const res = await post(url).field('applyWithholding', 'yes');
      expect(res.status).toBe(400);
      expect(declareBankTransfer).not.toHaveBeenCalled();
    });

    it('returns the retenue and stamp fields as numbers, with the gross and the settled amount', async () => {
      const res = await post(url).field('applyWithholding', 'true');
      expect(res.body).toMatchObject({
        amount: '991',
        withholdingRate: 1,
        withholdingAmount: 10,
        stampAmount: 1,
        grossAmount: 1001,
        settledAmount: 1000,
      });
    });
  });

  describe('POST admin record-cash', () => {
    const url = '/api/admin/quotations/q-1/installments/i-1/record-cash';

    it('records a cheque with the retenue', async () => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await post(url).send({
        method: 'cheque',
        applyWithholding: true,
        receiptNumber: 'CHQ-1',
      });
      expect(res.status).toBe(200);
      expect(recordCash).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'cheque',
          applyWithholding: true,
          receiptNumber: 'CHQ-1',
        }),
      );
      expect(res.body).toMatchObject({
        stampAmount: 1,
        grossAmount: 1001,
        settledAmount: 1000,
      });
    });

    it.each(['card', 'bank_transfer'])('method %s is a 400', async (method) => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await post(url).send({ method });
      expect(res.status).toBe(400);
      expect(recordCash).not.toHaveBeenCalled();
    });

    it('is closed to a dentist', async () => {
      const res = await post(url).send({ method: 'cash' });
      expect(res.status).toBe(403);
      expect(recordCash).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/payments/summary', () => {
    it('reaches the takings, not a parameter route', async () => {
      const res = await get(
        '/api/payments/summary?from=2026-11-06&to=2026-11-06',
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        from: '2026-11-06',
        to: '2026-11-06',
        timeZone: 'Africa/Tunis',
        currency: 'TND',
        total: { amount: '0.000', count: 0 },
      });
      expect(paymentGroupBy).toHaveBeenCalledTimes(1);
      expect(orderGroupBy).toHaveBeenCalledTimes(1);
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("scopes a dentist to their own orders, even when they send another dentist's id", async () => {
      const res = await get('/api/payments/summary?doctorId=u-other');

      expect(res.status).toBe(200);
      const [[args]] = paymentGroupBy.mock.calls as [
        [{ where: { order: unknown } }],
      ];
      expect(args.where.order).toEqual({ deletedAt: null, doctorId: 'u-doc' });
    });

    it('answers a period ending before it starts with 400 INVALID_DATE_RANGE', async () => {
      const res = await get(
        '/api/payments/summary?from=2026-11-07&to=2026-11-06',
      );

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
      expect(paymentGroupBy).not.toHaveBeenCalled();
    });

    it.each([
      '/api/payments/summary?from=2026-02-30',
      '/api/payments/summary?to=2026-11-6',
      '/api/payments/summary?purpose=installment',
    ])('answers %s with a 400', async (url) => {
      const res = await get(url);
      expect(res.status).toBe(400);
      expect(paymentGroupBy).not.toHaveBeenCalled();
    });

    it('is closed to a designer', async () => {
      caller = asUser('u-des', UserRole.designer);
      const res = await get('/api/payments/summary');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/payments/practitioners', () => {
    it('lists, for an admin, the dentists with a payment of the asked kind', async () => {
      caller = asUser('u-admin', UserRole.admin);
      findUsers.mockResolvedValue([
        { id: 'd-1', fullName: 'Dr Ben Ali', email: 'a@example.com' },
        { id: 'd-2', fullName: 'Dr Ben Ali', email: 'b@example.com' },
      ]);

      const res = await get(
        '/api/payments/practitioners?purpose=treatment_fee',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [
          { id: 'd-1', fullName: 'Dr Ben Ali', email: 'a@example.com' },
          { id: 'd-2', fullName: 'Dr Ben Ali', email: 'b@example.com' },
        ],
      });
      const [[args]] = findUsers.mock.calls as [[{ where: unknown }]];
      expect(args.where).toEqual({
        doctorOrders: {
          some: { deletedAt: null, treatmentFeePaymentMethod: { not: null } },
        },
      });
    });

    it('reads installments from the Payment rows of live orders', async () => {
      caller = asUser('u-admin', UserRole.super_admin);
      await get('/api/payments/practitioners?purpose=installment');
      const [[args]] = findUsers.mock.calls as [[{ where: unknown }]];
      expect(args.where).toEqual({
        doctorOrders: {
          some: {
            deletedAt: null,
            payments: { some: { purpose: 'installment' } },
          },
        },
      });
    });

    it('is closed to a dentist, whose lists are always their own', async () => {
      const res = await get('/api/payments/practitioners?purpose=installment');
      expect(res.status).toBe(403);
      expect(findUsers).not.toHaveBeenCalled();
    });

    it.each([
      '/api/payments/practitioners',
      '/api/payments/practitioners?purpose=refund',
    ])('answers %s with a 400', async (url) => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await get(url);
      expect(res.status).toBe(400);
      expect(findUsers).not.toHaveBeenCalled();
    });
  });

  it('GET /api/payments/mine still reaches the history', async () => {
    const res = await get(
      '/api/payments/mine?purpose=installment&from=2026-11-01',
    );

    expect(res.status).toBe(200);
    expect(listPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'installment',
        from: '2026-11-01',
        caller: { userId: 'u-doc', role: UserRole.dentist },
      }),
    );
  });
});
