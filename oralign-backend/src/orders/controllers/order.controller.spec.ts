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

// The controller's services pull in the Puppeteer PDF renderer (ESM-only)
// and the media pipeline. The treatment-fee list routes reach only
// TreatmentFeeService, mocked below: each service is an empty DI token.
jest.mock('../services/order.service', () => ({
  OrderService: class OrderService {},
}));
jest.mock('../services/order-files.service', () => ({
  OrderFilesService: class OrderFilesService {},
}));
jest.mock('../services/order-export.service', () => ({
  OrderExportService: class OrderExportService {},
}));
jest.mock('../services/chunked-upload.service', () => ({
  ChunkedUploadService: class ChunkedUploadService {},
}));
jest.mock('../services/order-audit.service', () => ({
  OrderAuditService: class OrderAuditService {},
}));
jest.mock('../services/treatment-fee.service', () => ({
  TreatmentFeeService: class TreatmentFeeService {},
}));

import { ChunkedUploadService } from '../services/chunked-upload.service';
import { OrderAuditService } from '../services/order-audit.service';
import { OrderExportService } from '../services/order-export.service';
import { OrderFilesService } from '../services/order-files.service';
import { OrderService } from '../services/order.service';
import { TreatmentFeeService } from '../services/treatment-fee.service';
import { OrderController } from './order.controller';

const asUser = (sub: string, role: UserRole) =>
  ({ sub, role, email: `${sub}@example.com` }) as JwtPayload;

const EMPTY_PAGE = { data: [], total: 0, page: 1, limit: 25, totalPages: 0 };

/**
 * The real controller, pipe, roles guard and exception filter, as main.ts
 * wires them; only the JWT check is replaced by a fixed caller and the
 * services by mocks. Proves how a query string reaches the service.
 */
describe('OrderController treatment-fee lists over HTTP', () => {
  let app: INestApplication<App>;
  let caller = asUser('u-admin', UserRole.admin);
  const listTreatmentFees = jest.fn();
  const listPendingTreatmentFees = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: {} },
        { provide: OrderFilesService, useValue: {} },
        { provide: OrderExportService, useValue: {} },
        { provide: ChunkedUploadService, useValue: {} },
        { provide: OrderAuditService, useValue: {} },
        {
          provide: TreatmentFeeService,
          useValue: { listTreatmentFees, listPendingTreatmentFees },
        },
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
    caller = asUser('u-admin', UserRole.admin);
    listTreatmentFees.mockReset().mockResolvedValue(EMPTY_PAGE);
    listPendingTreatmentFees.mockReset().mockResolvedValue(EMPTY_PAGE);
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  describe('GET /api/orders/admin/treatment-fees (history)', () => {
    it('hands every filter, parsed, and the caller to the service', async () => {
      const res = await get(
        '/api/orders/admin/treatment-fees?page=2&limit=10&search=%20TF-000042%20' +
          '&from=2026-11-01&to=2026-11-06&doctorId=u-doc&methods=card,cash' +
          '&statuses=success&statuses=awaiting_confirmation&sortBy=amount&sortOrder=asc',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual(EMPTY_PAGE);
      expect(listTreatmentFees).toHaveBeenCalledWith(
        {
          page: 2,
          limit: 10,
          search: 'TF-000042',
          from: '2026-11-01',
          to: '2026-11-06',
          doctorId: 'u-doc',
          methods: ['card', 'cash'],
          statuses: ['success', 'awaiting_confirmation'],
          sortBy: 'amount',
          sortOrder: 'asc',
        },
        { userId: 'u-admin', role: UserRole.admin },
      );
    });

    it.each([
      'page=abc',
      'limit=500',
      'from=2026-02-30',
      'methods=cheque',
      'purpose=treatment_fee',
    ])('?%s is a 400, before the service', async (query) => {
      const res = await get(`/api/orders/admin/treatment-fees?${query}`);
      expect(res.status).toBe(400);
      expect(listTreatmentFees).not.toHaveBeenCalled();
    });

    it('a dentist reads it too: the service scopes them to their own orders', async () => {
      caller = asUser('u-doc', UserRole.dentist);
      const res = await get('/api/orders/admin/treatment-fees');
      expect(res.status).toBe(200);
      expect(listTreatmentFees).toHaveBeenCalledWith(
        {},
        { userId: 'u-doc', role: UserRole.dentist },
      );
    });

    it('is closed to a designer', async () => {
      caller = asUser('u-des', UserRole.designer);
      const res = await get('/api/orders/admin/treatment-fees');
      expect(res.status).toBe(403);
      expect(listTreatmentFees).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/orders/admin/treatment-fees/pending (confirmation queue)', () => {
    it('hands page and limit, as numbers, and the caller to the service', async () => {
      const res = await get(
        '/api/orders/admin/treatment-fees/pending?page=2&limit=5',
      );
      expect(res.status).toBe(200);
      expect(listPendingTreatmentFees).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        caller: { userId: 'u-admin', role: UserRole.admin },
      });
      expect(listTreatmentFees).not.toHaveBeenCalled();
    });

    it.each(['page=abc', 'page=0', 'limit=101', 'search=Sarah'])(
      '?%s is a 400, never a NaN page reaching the database',
      async (query) => {
        const res = await get(
          `/api/orders/admin/treatment-fees/pending?${query}`,
        );
        expect(res.status).toBe(400);
        expect(listPendingTreatmentFees).not.toHaveBeenCalled();
      },
    );

    it('is admin-only', async () => {
      caller = asUser('u-doc', UserRole.dentist);
      const res = await get('/api/orders/admin/treatment-fees/pending');
      expect(res.status).toBe(403);
      expect(listPendingTreatmentFees).not.toHaveBeenCalled();
    });
  });
});
