import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ConfirmPaymentDto,
  DeclareBankTransferDto,
  PaymentFilterDto,
  RecordCashPaymentDto,
  RejectPaymentDto,
} from '../dto/payment.dto';
import { PaymentsService } from '../services/payments.service';

const PROOF_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'payments');
mkdirSync(PROOF_UPLOAD_ROOT, { recursive: true });

const PROOF_ALLOWED_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
];

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Payment endpoints. The controller is intentionally thin — every
 * mutation routes into PaymentsService where the single SUCCESS
 * transition + idempotency live. Authorisation is split:
 *   • Doctor endpoints: JwtAuthGuard + ownership check inside the
 *     service.
 *   • Admin endpoints: JwtAuthGuard + RolesGuard with admin /
 *     super_admin.
 */
@ApiTags('payments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // ─── Doctor-facing — CARD ──────────────────────────────────────

  @Post('quotations/:quotationId/installments/:installmentId/pay-by-card')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pay an installment by card. The amount is loaded server-side from the ' +
      'installment row under FOR UPDATE — the client never provides it.',
  })
  async payByCard(
    @Param('quotationId') _quotationId: string,
    @Param('installmentId') installmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-mock-outcome') mockOutcome: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.payByCard({
      installmentId,
      caller: { userId: user.sub, role: user.role as UserRole },
      idempotencyKey,
      headers: { 'x-mock-outcome': mockOutcome },
    });
  }

  // ─── Doctor-facing — BANK_TRANSFER ─────────────────────────────

  @Post(
    'quotations/:quotationId/installments/:installmentId/declare-bank-transfer',
  )
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('proofFile', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, PROOF_UPLOAD_ROOT),
        filename: (_req, file, cb) =>
          cb(null, `${randomUUID()}${extname(file.originalname || '').toLowerCase()}`),
      }),
      limits: { fileSize: PROOF_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (PROOF_ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Proof must be PNG/JPG/WebP/HEIC or PDF.'), false);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bankReference: { type: 'string' },
        proofFile: { type: 'string', format: 'binary' },
      },
    },
  })
  async declareBankTransfer(
    @Param('quotationId') _quotationId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: DeclareBankTransferDto,
    @UploadedFile() proof: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const proofUrl = proof
      ? `/uploads/payments/${proof.filename}`
      : null;
    return this.payments.declareBankTransfer({
      installmentId,
      caller: { userId: user.sub, role: user.role as UserRole },
      bankReference: dto.bankReference,
      proofUrl,
    });
  }

  // ─── Doctor reads their own payment ────────────────────────────

  @Get('quotations/:quotationId/payments/:paymentId')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin, UserRole.designer)
  @HttpCode(HttpStatus.OK)
  async getOwnPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.getPayment(paymentId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  // ─── Admin-facing — pending confirmations queue ───────────────

  @Get('admin/payments/pending-confirmations')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async listPending(
    @Query() filters: PaymentFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.listPendingConfirmations({
      ...filters,
      caller: { userId: user.sub, role: user.role as UserRole },
    });
  }

  // Full payment history — admin sees every payment in the system.
  // Same paginated envelope as the pending queue so the UI can reuse
  // the same shape and components.
  @Get('admin/payments')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async listAllPayments(
    @Query() filters: PaymentFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.listPayments({
      ...filters,
      caller: { userId: user.sub, role: user.role as UserRole },
    });
  }

  // Doctor's own payment history. Admins can hit this too and the
  // service still returns *all* payments (the doctor-scoping branch
  // only kicks in for the dentist role) — that keeps the route
  // versatile without forcing two parallel endpoints.
  @Get('payments/mine')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async listMyPayments(
    @Query() filters: PaymentFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.listPayments({
      ...filters,
      caller: { userId: user.sub, role: user.role as UserRole },
    });
  }

  @Get('admin/payments/:paymentId')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async adminGet(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.getPayment(paymentId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('admin/payments/:paymentId/confirm')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.confirmBankTransfer(paymentId, dto.notes, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post('admin/payments/:paymentId/reject')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('paymentId') paymentId: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.rejectBankTransfer(paymentId, dto.rejectionReason, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }

  @Post(
    'admin/quotations/:quotationId/installments/:installmentId/record-cash',
  )
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async recordCash(
    @Param('quotationId') _quotationId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: RecordCashPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.recordCash({
      installmentId,
      receiptNumber: dto.receiptNumber,
      notes: dto.notes,
      caller: { userId: user.sub, role: user.role as UserRole },
    });
  }
}
