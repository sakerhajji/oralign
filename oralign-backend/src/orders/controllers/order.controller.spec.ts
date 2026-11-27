import {
  type ExecutionContext,
  type INestApplication,
  StreamableFile,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { NotFoundException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
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

import { RECEIPT_MAX_BYTES } from '../../payments/receipt-file';
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

/** The stable errorCode of an error answer. */
const errorCodeOf = (res: { body: unknown }) =>
  (res.body as { errorCode?: string }).errorCode;

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
  const payTreatmentFee = jest.fn();
  const uploadTreatmentFeeProof = jest.fn();
  const withdrawTreatmentFeeProof = jest.fn();
  const readTreatmentFeeProof = jest.fn();
  const markTreatmentFeeReviewOpened = jest.fn();
  const confirmTreatmentFeePayment = jest.fn();
  const rejectTreatmentFeePayment = jest.fn();
  const getDownloadFile = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: {} },
        { provide: OrderFilesService, useValue: { getDownloadFile } },
        { provide: OrderExportService, useValue: {} },
        { provide: ChunkedUploadService, useValue: {} },
        { provide: OrderAuditService, useValue: {} },
        {
          provide: TreatmentFeeService,
          useValue: {
            listTreatmentFees,
            listPendingTreatmentFees,
            payTreatmentFee,
            uploadTreatmentFeeProof,
            withdrawTreatmentFeeProof,
            readTreatmentFeeProof,
            markTreatmentFeeReviewOpened,
            confirmTreatmentFeePayment,
            rejectTreatmentFeePayment,
          },
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
    payTreatmentFee.mockReset().mockResolvedValue({ id: 'o-1' });
    uploadTreatmentFeeProof.mockReset().mockResolvedValue({ id: 'o-1' });
    withdrawTreatmentFeeProof.mockReset().mockResolvedValue({ id: 'o-1' });
    readTreatmentFeeProof.mockReset();
    markTreatmentFeeReviewOpened.mockReset().mockResolvedValue({
      orderId: 'o-1',
      subjectKey: 'treatment_fee:o-1:1764235800000',
      reviewOpenedAt: new Date('2026-11-27T09:30:00.000Z'),
      firstOpen: true,
    });
    confirmTreatmentFeePayment.mockReset().mockResolvedValue({ id: 'o-1' });
    rejectTreatmentFeePayment.mockReset().mockResolvedValue({ id: 'o-1' });
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
      'methods=crypto',
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

  describe('POST /api/orders/:id/treatment-fee/pay', () => {
    const pay = (body: object) =>
      request(app.getHttpServer())
        .post('/api/orders/o-1/treatment-fee/pay')
        .send(body);

    it.each([
      [true, true],
      ['false', false],
      [undefined, undefined],
    ])('passes applyWithholding %p as %p', async (raw, expected) => {
      const res = await pay({ method: 'cheque', applyWithholding: raw });
      expect(res.status).toBe(200);
      expect(payTreatmentFee).toHaveBeenCalledWith(
        'o-1',
        'cheque',
        { userId: 'u-admin', role: UserRole.admin },
        expected,
        undefined,
      );
    });

    it("passes an admin's override note for a transfer declared without a receipt", async () => {
      const res = await pay({
        method: 'bank_transfer',
        overrideNote: 'Virement vu sur le relevé',
      });
      expect(res.status).toBe(200);
      expect(payTreatmentFee).toHaveBeenCalledWith(
        'o-1',
        'bank_transfer',
        { userId: 'u-admin', role: UserRole.admin },
        undefined,
        'Virement vu sur le relevé',
      );
    });

    it('still refuses a smuggled amount', async () => {
      const res = await pay({ method: 'cash', amount: 1 });
      expect(res.status).toBe(400);
      expect(payTreatmentFee).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/orders/:id/treatment-fee/proof (multipart)', () => {
    const proof = () =>
      request(app.getHttpServer()).post('/api/orders/o-1/treatment-fee/proof');

    it('accepts applyWithholding "false"; without a file the service answers (PROOF_REQUIRED)', async () => {
      const res = await proof().field('applyWithholding', 'false');
      expect(res.status).toBe(200);
      expect(uploadTreatmentFeeProof).toHaveBeenCalledWith(
        'o-1',
        null,
        { userId: 'u-admin', role: UserRole.admin },
        false,
        undefined,
      );
    });

    it('hands the in-memory receipt and the Idempotency-Key to the service', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = await proof()
        .set('Idempotency-Key', 'fee-key-0001')
        .attach('proof', jpeg, {
          filename: 'recu.jpg',
          contentType: 'image/jpeg',
        });
      expect(res.status).toBe(200);
      const [, receipt, , , key] = uploadTreatmentFeeProof.mock.calls[0] as [
        string,
        { buffer: Buffer; path?: string },
        unknown,
        unknown,
        string,
      ];
      // memoryStorage: nothing written before the service checks it.
      expect(receipt.buffer.equals(jpeg)).toBe(true);
      expect(receipt).not.toHaveProperty('path');
      expect(key).toBe('fee-key-0001');
    });

    it('a receipt over 10 MB is a 400 RECEIPT_TOO_LARGE, before the service', async () => {
      const res = await proof().attach(
        'proof',
        Buffer.alloc(RECEIPT_MAX_BYTES + 1, 0x20),
        { filename: 'big.jpg', contentType: 'image/jpeg' },
      );
      expect(res.status).toBe(400);
      expect(errorCodeOf(res)).toBe(TRANSFER_ERROR.RECEIPT_TOO_LARGE);
      expect(uploadTreatmentFeeProof).not.toHaveBeenCalled();
    });

    it.each([['yes'], ['1']])('refuses applyWithholding %p', async (raw) => {
      const res = await proof().field('applyWithholding', raw);
      expect(res.status).toBe(400);
      expect(uploadTreatmentFeeProof).not.toHaveBeenCalled();
    });

    it('refuses an amount field: the fee is computed server-side', async () => {
      const res = await proof().field('amount', '1');
      expect(res.status).toBe(400);
      expect(uploadTreatmentFeeProof).not.toHaveBeenCalled();
    });
  });

  describe('treatment-fee transfer routes (spec §1)', () => {
    const at = (url: string) => `/api/orders/o-1/treatment-fee/${url}`;

    it('DELETE proof withdraws the declaration for the caller', async () => {
      caller = asUser('u-doc', UserRole.dentist);
      const res = await request(app.getHttpServer()).delete(at('proof'));
      expect(res.status).toBe(200);
      expect(withdrawTreatmentFeeProof).toHaveBeenCalledWith('o-1', {
        userId: 'u-doc',
        role: UserRole.dentist,
      });
    });

    it('GET proof streams the receipt with the private headers', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oralign-fee-'));
      const stored = path.join(dir, 'r.jpg');
      fs.writeFileSync(stored, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      readTreatmentFeeProof.mockResolvedValue({
        receipt: {
          absolutePath: stored,
          contentType: 'image/jpeg',
          size: 4,
          extension: 'jpg',
        },
        downloadName: 'recu-frais-ORD-1',
      });
      try {
        const res = await get(at('proof'));
        expect(res.status).toBe(200);
        expect(res.headers).toMatchObject({
          'content-type': 'image/jpeg',
          'x-content-type-options': 'nosniff',
          'cache-control': 'private, no-store',
          'content-disposition': 'inline; filename="recu-frais-ORD-1.jpg"',
          'content-security-policy': "default-src 'none'; sandbox",
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it.each([UserRole.designer, UserRole.technician])(
      'GET proof: a %s reaches the service and reads its 404 PROOF_NOT_FOUND',
      async (role) => {
        caller = asUser('u-x', role);
        readTreatmentFeeProof.mockRejectedValue(
          new NotFoundException(
            'Aucun reçu disponible.',
            TRANSFER_ERROR.PROOF_NOT_FOUND,
          ),
        );
        const res = await get(at('proof'));
        expect(res.status).toBe(404);
        expect(errorCodeOf(res)).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
      },
    );

    it('review-opened is admin-only and answers the subject', async () => {
      caller = asUser('u-doc', UserRole.dentist);
      const denied = await request(app.getHttpServer()).post(
        at('review-opened'),
      );
      expect(denied.status).toBe(403);

      caller = asUser('u-admin', UserRole.admin);
      const res = await request(app.getHttpServer()).post(at('review-opened'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        orderId: 'o-1',
        subjectKey: 'treatment_fee:o-1:1764235800000',
        reviewOpenedAt: '2026-11-27T09:30:00.000Z',
        firstOpen: true,
      });
    });

    it('confirm passes the override note and the reviewed declaration', async () => {
      const res = await request(app.getHttpServer()).post(at('confirm')).send({
        overrideNote: 'Relevé vu',
        declaredAt: '2026-11-27T09:30:00.000Z',
      });
      expect(res.status).toBe(200);
      expect(confirmTreatmentFeePayment).toHaveBeenCalledWith(
        'o-1',
        { userId: 'u-admin', role: UserRole.admin },
        { overrideNote: 'Relevé vu', declaredAt: '2026-11-27T09:30:00.000Z' },
      );
    });

    it('confirm refuses a declaredAt that is not an instant, and a smuggled amount', async () => {
      for (const body of [{ declaredAt: 'yesterday' }, { amount: 1 }]) {
        const res = await request(app.getHttpServer())
          .post(at('confirm'))
          .send(body);
        expect(res.status).toBe(400);
      }
      expect(confirmTreatmentFeePayment).not.toHaveBeenCalled();
    });

    it('reject trims the reason before the service', async () => {
      const res = await request(app.getHttpServer())
        .post(at('reject'))
        .send({ rejectionReason: '  Reçu illisible  ' });
      expect(res.status).toBe(200);
      expect(rejectTreatmentFeePayment).toHaveBeenCalledWith(
        'o-1',
        { userId: 'u-admin', role: UserRole.admin },
        { rejectionReason: 'Reçu illisible', declaredAt: undefined },
      );
    });

    it('reject without a reason is a 400; a dentist cannot confirm or reject', async () => {
      const missing = await request(app.getHttpServer())
        .post(at('reject'))
        .send({});
      expect(missing.status).toBe(400);

      caller = asUser('u-doc', UserRole.dentist);
      for (const url of ['confirm', 'reject']) {
        const res = await request(app.getHttpServer())
          .post(at(url))
          .send({ rejectionReason: 'Reçu illisible' });
        expect(res.status).toBe(403);
      }
      expect(confirmTreatmentFeePayment).not.toHaveBeenCalled();
      expect(rejectTreatmentFeePayment).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/orders/:id/files/:fileId/download (security headers)', () => {
    const SECURITY_HEADERS = {
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    };

    it('an inline variant is sent with nosniff and the sandbox CSP', async () => {
      const openStream = jest.fn(
        () => new StreamableFile(Readable.from(['variant-bytes'])),
      );
      getDownloadFile.mockReset().mockResolvedValue({
        openStream,
        contentType: 'image/webp',
        inline: true,
        downloadName: 'front-photo-001__md.webp',
        absolutePath: '/nowhere',
      });

      const res = await get('/api/orders/o-1/files/f-1/download?variant=md');

      expect(res.status).toBe(200);
      expect(getDownloadFile).toHaveBeenCalledWith(
        'o-1',
        'f-1',
        { userId: 'u-admin', role: UserRole.admin },
        'md',
      );
      expect(res.headers).toMatchObject({
        'content-type': 'image/webp',
        ...SECURITY_HEADERS,
      });
      // The inline branch opens the file once and sends its bytes.
      expect(openStream).toHaveBeenCalledTimes(1);
      expect((res.body as Buffer).toString()).toBe('variant-bytes');
    });

    it('an original attachment carries them too', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oralign-dl-'));
      const stored = path.join(dir, 'photo');
      fs.writeFileSync(stored, '<svg/>');
      const openStream = jest.fn(
        () => new StreamableFile(Readable.from(['x'])),
      );
      getDownloadFile.mockReset().mockResolvedValue({
        openStream,
        contentType: 'application/octet-stream',
        inline: false,
        downloadName: 'photo',
        absolutePath: stored,
      });

      try {
        const res = await get('/api/orders/o-1/files/f-1/download');
        expect(res.status).toBe(200);
        expect(res.headers).toMatchObject({
          'content-type': 'application/octet-stream',
          ...SECURITY_HEADERS,
        });
        expect(res.headers['content-disposition']).toMatch(/^attachment/);
        // Sent by path: no stream is ever opened, so none is left holding
        // a file descriptor (R2).
        expect(openStream).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an attachment keeps what express sends a file with: its length, ranges and RFC 5987 name', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oralign-dl-'));
      const stored = path.join(dir, 'blob');
      fs.writeFileSync(stored, 'stl-bytes');
      getDownloadFile.mockReset().mockResolvedValue({
        openStream: jest.fn(),
        contentType: 'application/octet-stream',
        inline: false,
        downloadName: 'Arcade-Œ.stl',
        absolutePath: stored,
      });

      try {
        const res = await get('/api/orders/o-1/files/f-1/download');
        expect(res.status).toBe(200);
        expect(res.headers['content-length']).toBe('9');
        expect(res.headers['accept-ranges']).toBe('bytes');
        // RFC 5987: an ASCII fallback and the UTF-8 name.
        expect(res.headers['content-disposition']).toBe(
          `attachment; filename="Arcade-?.stl"; filename*=UTF-8''Arcade-%C5%92.stl`,
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
