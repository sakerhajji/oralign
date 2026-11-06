import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsSummaryService,
        {
          provide: PrismaService,
          useValue: {
            payment: { groupBy: paymentGroupBy },
            dentalOrder: { groupBy: orderGroupBy },
          },
        },
        { provide: PaymentsService, useValue: { listPayments } },
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
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

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
