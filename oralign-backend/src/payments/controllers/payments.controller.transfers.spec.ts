import {
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { NotFoundException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import { AllExceptionsFilter } from '../../common/exceptions/exception.filter';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. These routes never reach it.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import { RECEIPT_MAX_BYTES } from '../receipt-file';
import { ClicToPayPaymentsService } from '../services/clictopay-payments.service';
import { PaymentPractitionersService } from '../services/payment-practitioners.service';
import { PaymentsService } from '../services/payments.service';
import { PaymentsSummaryService } from '../services/payments-summary.service';
import { PaymentsController } from './payments.controller';

const asUser = (sub: string, role: UserRole) =>
  ({ sub, role, email: `${sub}@example.com` }) as JwtPayload;

/** The JSON body of an answer, as the assertions read it. */
const bodyOf = (res: { body: unknown }) =>
  res.body as { errorCode?: string; withholdingThreshold?: unknown };

/** The first argument of a mock's first call. */
const firstArg = (fn: jest.Mock) =>
  (fn.mock.calls[0] as [Record<string, unknown>])[0];

/** A declaration as Prisma returns it, with every admin-only column. */
const declared = {
  id: 'p-1',
  amount: new Prisma.Decimal('1001.000'),
  withholdingRate: null,
  withholdingAmount: new Prisma.Decimal('0'),
  stampAmount: new Prisma.Decimal('1.000'),
  status: 'awaiting_confirmation',
  proofUrl: '/uploads/orders/o-1/payment-proofs/r.pdf',
  notes: 'admin note',
  initiatedById: 'u-doc',
  declarationKey: 'decl-key-0001',
  reviewOpenedById: null,
  reviewOpenedByName: null,
  cancelledById: null,
  cancelledByName: null,
  reviewOpenedAt: null,
  cancelledAt: null,
  withholdingThreshold: new Prisma.Decimal('1000.000'),
};

/**
 * The transfer routes of PaymentsController (spec §1) over HTTP: the real
 * controller, receipt interceptor, validation pipe, roles guard and
 * exception filter; the JWT check is a fixed caller, the service a mock.
 */
describe('PaymentsController transfer routes over HTTP', () => {
  let app: INestApplication<App>;
  let caller = asUser('u-doc', UserRole.dentist);
  const declareBankTransfer = jest.fn();
  const withdrawBankTransfer = jest.fn();
  const readPaymentProof = jest.fn();
  const markTransferReviewOpened = jest.fn();
  const confirmBankTransfer = jest.fn();
  const rejectBankTransfer = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsSummaryService, useValue: {} },
        { provide: PaymentPractitionersService, useValue: {} },
        { provide: ClicToPayPaymentsService, useValue: {} },
        {
          provide: PaymentsService,
          useValue: {
            declareBankTransfer,
            withdrawBankTransfer,
            readPaymentProof,
            markTransferReviewOpened,
            confirmBankTransfer,
            rejectBankTransfer,
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
    caller = asUser('u-doc', UserRole.dentist);
    declareBankTransfer.mockReset().mockResolvedValue(declared);
    withdrawBankTransfer
      .mockReset()
      .mockResolvedValue({ ...declared, status: 'cancelled' });
    readPaymentProof.mockReset();
    markTransferReviewOpened.mockReset().mockResolvedValue({
      paymentId: 'p-1',
      reviewOpenedAt: new Date('2026-11-27T09:00:00.000Z'),
      firstOpen: true,
    });
    confirmBankTransfer
      .mockReset()
      .mockResolvedValue({ ...declared, status: 'success' });
    rejectBankTransfer
      .mockReset()
      .mockResolvedValue({ ...declared, status: 'rejected' });
  });

  const server = () => app.getHttpServer();

  describe('POST declare-bank-transfer', () => {
    const url = '/api/quotations/q-1/installments/i-1/declare-bank-transfer';
    const pdf = Buffer.from('%PDF-1.4 receipt');

    it('hands the in-memory receipt, the key and the note to the service', async () => {
      const res = await request(server())
        .post(url)
        .set('Idempotency-Key', 'decl-key-0001')
        .field('overrideNote', 'Relevé vu')
        .attach('proofFile', pdf, {
          filename: 'recu.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(200);
      const args = firstArg(declareBankTransfer) as {
        receipt: { buffer: Buffer; size: number; originalname: string };
        idempotencyKey: string;
        overrideNote: string;
        installmentId: string;
        caller: unknown;
      };
      // memoryStorage: the bytes, never a path on disk.
      expect(Buffer.isBuffer(args.receipt.buffer)).toBe(true);
      expect(args.receipt.buffer.equals(pdf)).toBe(true);
      expect(args.receipt).not.toHaveProperty('path');
      expect(args).toMatchObject({
        installmentId: 'i-1',
        idempotencyKey: 'decl-key-0001',
        overrideNote: 'Relevé vu',
        caller: { userId: 'u-doc', role: UserRole.dentist },
      });
    });

    it('without a file the service decides (receipt null)', async () => {
      const res = await request(server())
        .post(url)
        .field('bankReference', 'T-1');
      expect(res.status).toBe(200);
      expect(firstArg(declareBankTransfer)).toMatchObject({
        receipt: null,
        idempotencyKey: undefined,
      });
    });

    it('a receipt over 10 MB is a 400 RECEIPT_TOO_LARGE, never a 413 or a 500', async () => {
      const res = await request(server())
        .post(url)
        .attach('proofFile', Buffer.alloc(RECEIPT_MAX_BYTES + 1, 0x20), {
          filename: 'big.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(400);
      expect(bodyOf(res).errorCode).toBe(TRANSFER_ERROR.RECEIPT_TOO_LARGE);
      expect(declareBankTransfer).not.toHaveBeenCalled();
    });

    it("a dentist reads hasProof and none of the admin's columns", async () => {
      const res = await request(server())
        .post(url)
        .field('bankReference', 'T-1');
      expect(res.body).toMatchObject({ id: 'p-1', hasProof: true });
      for (const key of [
        'notes',
        'declarationKey',
        'initiatedById',
        'reviewOpenedById',
      ]) {
        expect(res.body).not.toHaveProperty(key);
      }
    });

    it('the retenue threshold snapshot is a 3-decimal number, null before the rule', async () => {
      const res = await request(server())
        .post(url)
        .field('bankReference', 'T-1');
      expect(bodyOf(res).withholdingThreshold).toBe(1000);

      declareBankTransfer.mockResolvedValue({
        ...declared,
        withholdingThreshold: null,
      });
      const before = await request(server())
        .post(url)
        .field('bankReference', 'T-1');
      expect(bodyOf(before).withholdingThreshold).toBeNull();
    });

    it('an admin reads every column', async () => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await request(server())
        .post(url)
        .field('bankReference', 'T-1');
      expect(res.body).toMatchObject({
        notes: 'admin note',
        declarationKey: 'decl-key-0001',
        hasProof: true,
      });
    });

    it('is closed to a designer and a technician', async () => {
      for (const role of [UserRole.designer, UserRole.technician]) {
        caller = asUser('u-x', role);
        const res = await request(server())
          .post(url)
          .field('bankReference', 'T-1');
        expect(res.status).toBe(403);
      }
      expect(declareBankTransfer).not.toHaveBeenCalled();
    });
  });

  describe('POST payments/:paymentId/withdraw', () => {
    it('hands the note to the service and answers the cancelled row', async () => {
      const res = await request(server())
        .post('/api/payments/p-1/withdraw')
        .send({ note: 'Mauvais fichier' });
      expect(res.status).toBe(200);
      expect(withdrawBankTransfer).toHaveBeenCalledWith(
        'p-1',
        { userId: 'u-doc', role: UserRole.dentist },
        'Mauvais fichier',
      );
      expect(res.body).toMatchObject({ status: 'cancelled', hasProof: true });
      expect(res.body).not.toHaveProperty('notes');
    });

    it('refuses an unknown field or a note over 500 characters', async () => {
      for (const body of [{ reason: 'x' }, { note: 'x'.repeat(501) }]) {
        const res = await request(server())
          .post('/api/payments/p-1/withdraw')
          .send(body);
        expect(res.status).toBe(400);
      }
      expect(withdrawBankTransfer).not.toHaveBeenCalled();
    });

    it('is closed to a designer', async () => {
      caller = asUser('u-des', UserRole.designer);
      const res = await request(server())
        .post('/api/payments/p-1/withdraw')
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('GET payments/:paymentId/proof', () => {
    let dir: string;
    let file: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oralign-proof-'));
      file = path.join(dir, 'r.pdf');
      fs.writeFileSync(file, '%PDF-1.4 receipt');
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('streams the receipt with the private headers', async () => {
      caller = asUser('u-admin', UserRole.admin);
      readPaymentProof.mockResolvedValue({
        receipt: {
          absolutePath: file,
          contentType: 'application/pdf',
          size: 16,
          extension: 'pdf',
        },
        downloadName: 'recu-ORD-1-echeance-2',
      });
      const res = await request(server()).get('/api/payments/p-1/proof');
      expect(res.status).toBe(200);
      expect(res.headers).toMatchObject({
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'content-disposition': 'inline; filename="recu-ORD-1-echeance-2.pdf"',
      });
      expect(readPaymentProof).toHaveBeenCalledWith('p-1', {
        userId: 'u-admin',
        role: UserRole.admin,
      });
    });

    it.each([UserRole.designer, UserRole.technician])(
      'a %s passes the role check and reads the same 404 PROOF_NOT_FOUND as a missing file',
      async (role) => {
        caller = asUser('u-x', role);
        readPaymentProof.mockRejectedValue(
          new NotFoundException(
            'Aucun reçu disponible.',
            TRANSFER_ERROR.PROOF_NOT_FOUND,
          ),
        );
        const res = await request(server()).get('/api/payments/p-1/proof');
        expect(res.status).toBe(404);
        expect(bodyOf(res).errorCode).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
        expect(readPaymentProof).toHaveBeenCalledWith('p-1', {
          userId: 'u-x',
          role,
        });
      },
    );
  });

  describe('admin review routes', () => {
    it('review-opened answers the stamp, admin-only', async () => {
      const denied = await request(server()).post(
        '/api/admin/payments/p-1/review-opened',
      );
      expect(denied.status).toBe(403);

      caller = asUser('u-admin', UserRole.admin);
      const res = await request(server()).post(
        '/api/admin/payments/p-1/review-opened',
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        paymentId: 'p-1',
        reviewOpenedAt: '2026-11-27T09:00:00.000Z',
        firstOpen: true,
      });
    });

    it('confirm hands the notes and the override note', async () => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await request(server())
        .post('/api/admin/payments/p-1/confirm')
        .send({ notes: 'ok', overrideNote: 'Relevé du 21/11' });
      expect(res.status).toBe(200);
      expect(confirmBankTransfer).toHaveBeenCalledWith(
        'p-1',
        'ok',
        { userId: 'u-admin', role: UserRole.admin },
        { overrideNote: 'Relevé du 21/11' },
      );
    });

    it('reject trims the reason before the service', async () => {
      caller = asUser('u-admin', UserRole.admin);
      const res = await request(server())
        .post('/api/admin/payments/p-1/reject')
        .send({ rejectionReason: '  Montant différent  ' });
      expect(res.status).toBe(200);
      expect(rejectBankTransfer).toHaveBeenCalledWith(
        'p-1',
        'Montant différent',
        { userId: 'u-admin', role: UserRole.admin },
      );
    });

    it('reject without a reason is a 400 before the service (the 3-500 rule is the service code)', async () => {
      caller = asUser('u-admin', UserRole.admin);
      for (const body of [{}, { rejectionReason: null }, { reason: 'x' }]) {
        const res = await request(server())
          .post('/api/admin/payments/p-1/reject')
          .send(body);
        expect(res.status).toBe(400);
      }
      expect(rejectBankTransfer).not.toHaveBeenCalled();
    });

    it('confirm and reject are closed to a dentist', async () => {
      for (const url of [
        '/api/admin/payments/p-1/confirm',
        '/api/admin/payments/p-1/reject',
      ]) {
        const res = await request(server())
          .post(url)
          .send({ rejectionReason: 'Reçu illisible' });
        expect(res.status).toBe(403);
      }
      expect(confirmBankTransfer).not.toHaveBeenCalled();
      expect(rejectBankTransfer).not.toHaveBeenCalled();
    });
  });
});
