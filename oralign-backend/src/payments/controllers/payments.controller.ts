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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { Caller } from '../../common/access/caller';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ConfirmPaymentDto,
  CreateClicToPaySessionDto,
  DeclareBankTransferDto,
  PaymentFilterDto,
  PaymentPractitionersDto,
  PaymentPractitionersQueryDto,
  PaymentsSummaryDto,
  PaymentSummaryQueryDto,
  RecordCashPaymentDto,
  RejectPaymentDto,
  TransferReviewOpenedDto,
  WithdrawPaymentDto,
} from '../dto/payment.dto';
import {
  ReceiptFileInterceptor,
  type ReceiptUpload,
  sendReceipt,
} from '../receipt-file';
import { ClicToPayPaymentsService } from '../services/clictopay-payments.service';
import { PaymentPractitionersService } from '../services/payment-practitioners.service';
import { PaymentsService } from '../services/payments.service';
import { PaymentsSummaryService } from '../services/payments-summary.service';
import { toPaymentJson } from '../services/payment-rules';
import { paymentForViewer } from '../services/transfer-rules';

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
  constructor(
    private readonly payments: PaymentsService,
    private readonly clicToPayPayments: ClicToPayPaymentsService,
    private readonly summaries: PaymentsSummaryService,
    private readonly practitioners: PaymentPractitionersService,
  ) {}

  // ─── Doctor-facing — ClicToPay hosted checkout ────────────────

  @Post('payments/clictopay/session')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Create or reuse a ClicToPay hosted-payment session. The amount is always resolved server-side.',
  })
  async createClicToPaySession(
    @Body() dto: CreateClicToPaySessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clicToPayPayments.createSession(
      dto,
      { userId: user.sub, role: user.role },
      idempotencyKey,
    );
  }

  @Get('payments/clictopay/:paymentId/status')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify a hosted payment directly with ClicToPay. Browser return parameters are never trusted.',
  })
  async verifyClicToPayPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clicToPayPayments.verify(paymentId, {
      userId: user.sub,
      role: user.role,
    });
  }

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
    @Param('quotationId') quotationId: string,
    @Param('installmentId') installmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clicToPayPayments.createLegacyInstallmentSession(
      quotationId,
      installmentId,
      { userId: user.sub, role: user.role },
      idempotencyKey,
    );
  }

  // ─── Doctor-facing — BANK_TRANSFER ─────────────────────────────

  @Post(
    'quotations/:quotationId/installments/:installmentId/declare-bank-transfer',
  )
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  // memoryStorage: nothing reaches the disk before the service has
  // authorised the caller, checked the installment and the bytes.
  @UseInterceptors(ReceiptFileInterceptor('proofFile'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Declare a bank transfer for an installment. Receipt (JPEG/PNG/WebP/PDF, 10 MB) required for a dentist; an admin without one gives overrideNote. Idempotency-Key: a repeat by the same caller answers the same row. A declaration still awaiting on the installment is superseded. 409 INSTALLMENT_ALREADY_PAID once the installment is paid (e.g. an admin confirmed the transfer being replaced).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bankReference: { type: 'string' },
        applyWithholding: { type: 'string', enum: ['true', 'false'] },
        overrideNote: { type: 'string' },
        proofFile: { type: 'string', format: 'binary' },
      },
    },
  })
  async declareBankTransfer(
    @Param('quotationId') _quotationId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: DeclareBankTransferDto,
    @UploadedFile() proof: ReceiptUpload | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    const payment = await this.payments.declareBankTransfer({
      installmentId,
      caller,
      bankReference: dto.bankReference,
      receipt: proof ?? null,
      applyWithholding: dto.applyWithholding,
      overrideNote: dto.overrideNote,
      idempotencyKey,
    });
    return presentPayment(payment, caller);
  }

  /**
   * The doctor (or an admin for him) withdraws a declaration still
   * awaiting confirmation. The receipt is kept; a repeat answers 200.
   */
  @Post('payments/:paymentId/withdraw')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Withdraw a bank-transfer declaration still awaiting confirmation (status cancelled, receipt kept). 409 TRANSFER_NOT_WITHDRAWABLE once processed.',
  })
  async withdraw(
    @Param('paymentId') paymentId: string,
    @Body() dto: WithdrawPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.withdrawBankTransfer(paymentId, caller, dto.note),
      caller,
    );
  }

  /**
   * The receipt itself, for the owning dentist and admins (an
   * authenticated blob on the screens: the file is never public). Every
   * other caller, and a payment without one, gets 404 PROOF_NOT_FOUND:
   * designers and technicians are let through the role check on purpose,
   * so they read the same 404 as for a missing file.
   */
  @Get('payments/:paymentId/proof')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
    UserRole.technician,
  )
  @ApiOperation({
    summary:
      'Stream the bank-transfer receipt (owning dentist and admins). private, no-store; nosniff.',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  @ApiNotFoundResponse({ description: 'PROOF_NOT_FOUND' })
  async readProof(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { receipt, downloadName } = await this.payments.readPaymentProof(
      paymentId,
      callerOf(user),
    );
    sendReceipt(res, receipt, downloadName);
  }

  // ─── Doctor reads their own payment ────────────────────────────

  @Get('quotations/:quotationId/payments/:paymentId')
  @Roles(
    UserRole.dentist,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.designer,
  )
  @HttpCode(HttpStatus.OK)
  async getOwnPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.getPayment(paymentId, caller),
      caller,
    );
  }

  // ─── Admin-facing — pending confirmations queue ───────────────

  @Get('admin/payments/pending-confirmations')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async listPending(
    @Query() filters: PaymentFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return toPaymentPage(
      await this.payments.listPendingConfirmations({ ...filters, caller }),
      caller,
    );
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
    const caller = callerOf(user);
    return toPaymentPage(
      await this.payments.listPayments({ ...filters, caller }),
      caller,
    );
  }

  // Takings of a period (today by default): what a dentist paid, or what
  // the lab received. A static path: keep it above any GET
  // `payments/:paymentId` route of this controller.
  @Get('payments/summary')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Money received over a period of Africa/Tunis days (today when no date is given), per kind (installments, treatment fees) and per method. Successful payments only, archived orders excluded. Dentists get their own orders; admins every order or one dentist.',
  })
  @ApiOkResponse({ type: PaymentsSummaryDto })
  async summary(
    @Query() query: PaymentSummaryQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentsSummaryDto> {
    return this.summaries.summarise(query, {
      userId: user.sub,
      role: user.role,
    });
  }

  // The dentist filter of the payments desk: only the dentists who have a
  // payment of that kind. A static path, like `payments/summary`.
  @Get('payments/practitioners')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin: the dentists with at least one payment of the given kind (installment or treatment_fee) on a live order, sorted by name then e-mail.',
  })
  @ApiOkResponse({ type: PaymentPractitionersDto })
  async listPractitioners(
    @Query() query: PaymentPractitionersQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentPractitionersDto> {
    return this.practitioners.list(query.purpose, {
      userId: user.sub,
      role: user.role,
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
    const caller = callerOf(user);
    return toPaymentPage(
      await this.payments.listPayments({ ...filters, caller }),
      caller,
    );
  }

  @Get('admin/payments/:paymentId')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async adminGet(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.getPayment(paymentId, caller),
      caller,
    );
  }

  /**
   * An admin opened the receipt: the first opening stamps reviewOpenedAt
   * ("À vérifier"), every opening marks this admin's notifications of the
   * transfer read.
   */
  @Post('admin/payments/:paymentId/review-opened')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record that an admin opened a transfer receipt (the first opening stamps reviewOpenedAt; processed transfers are not stamped).',
  })
  @ApiOkResponse({ type: TransferReviewOpenedDto })
  async reviewOpened(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferReviewOpenedDto> {
    return this.payments.markTransferReviewOpened(paymentId, callerOf(user));
  }

  @Post('admin/payments/:paymentId/confirm')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm a bank transfer (a repeat on a confirmed one: 200). 409 TRANSFER_ALREADY_PROCESSED / INSTALLMENT_ALREADY_PAID; 400 PROOF_OVERRIDE_NOTE_REQUIRED without a receipt.',
  })
  async confirm(
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.confirmBankTransfer(paymentId, dto.notes, caller, {
        overrideNote: dto.overrideNote,
      }),
      caller,
    );
  }

  @Post('admin/payments/:paymentId/reject')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Refuse a bank transfer with a reason (3-500 characters; a repeat: 200). 409 TRANSFER_ALREADY_PROCESSED.',
  })
  async reject(
    @Param('paymentId') paymentId: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.rejectBankTransfer(
        paymentId,
        dto.rejectionReason,
        caller,
      ),
      caller,
    );
  }

  @Post('admin/quotations/:quotationId/installments/:installmentId/record-cash')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  async recordCash(
    @Param('quotationId') _quotationId: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: RecordCashPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = callerOf(user);
    return presentPayment(
      await this.payments.recordCash({
        installmentId,
        receiptNumber: dto.receiptNumber,
        notes: dto.notes,
        method: dto.method,
        applyWithholding: dto.applyWithholding,
        caller,
      }),
      caller,
    );
  }
}

/** The principal of a request, as the services take it. */
function callerOf(user: JwtPayload): Caller {
  return { userId: user.sub, role: user.role };
}

/**
 * A payment as `caller` reads it: its retenue and stamp fields as numbers
 * and the retenue threshold snapshot as a 3-decimal number, null = taken
 * before the threshold existed (both by toPaymentJson, the one conversion
 * the ClicToPay responses share), `hasProof`, and, for a dentist, without
 * the admin-only columns (paymentForViewer).
 */
function presentPayment<T extends Parameters<typeof toPaymentJson>[0]>(
  payment: T,
  caller: Caller,
) {
  return paymentForViewer(toPaymentJson(payment), caller);
}

/** A payment list page, each row presented for the caller. */
function toPaymentPage<
  T extends { data: Parameters<typeof toPaymentJson>[0][] },
>(page: T, caller: Caller) {
  return {
    ...page,
    data: page.data.map((row) => presentPayment(row, caller)),
  };
}
