import { Injectable, Logger } from '@nestjs/common';
import {
  InstallmentStatus,
  Payment,
  PaymentMethod,
  PaymentProvider,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Caller, isAdmin } from '../../common/access/caller';
import { env } from '../../common/config/env';
import {
  AppException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotationService } from '../../quotations/services/quotation.service';
import { ClicToPayClient } from '../clictopay/clictopay.client';
import { ClicToPayError, ClicToPayStatus } from '../clictopay/clictopay.types';
import { CreateClicToPaySessionDto } from '../dto/payment.dto';
import { PaymentsService } from './payments.service';

const LIVE_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.pending,
  PaymentRecordStatus.unknown,
];

export interface HostedPaymentSession {
  paymentId: string;
  orderId: string;
  quotationId: string | null;
  installmentId: string | null;
  purpose: PaymentPurpose;
  status: PaymentRecordStatus;
  providerStatus: number | null;
  amount: string;
  currency: string;
  paymentUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

@Injectable()
export class ClicToPayPaymentsService {
  private readonly logger = new Logger(ClicToPayPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ClicToPayClient,
    private readonly payments: PaymentsService,
    private readonly quotations: QuotationService,
    private readonly events: EventEmitter2,
  ) {}

  async createLegacyInstallmentSession(
    quotationId: string,
    installmentId: string,
    caller: Caller,
    idempotencyKey?: string,
  ): Promise<HostedPaymentSession> {
    const installment = await this.prisma.quoteInstallment.findUnique({
      where: { id: installmentId },
      select: { quotationId: true, quotation: { select: { orderId: true } } },
    });
    if (!installment || installment.quotationId !== quotationId) {
      throw new NotFoundException('Installment not found.');
    }
    return this.createSession(
      {
        orderId: installment.quotation.orderId,
        purpose: PaymentPurpose.installment,
        installmentId,
        language: 'fr',
      },
      caller,
      idempotencyKey,
    );
  }

  async createSession(
    dto: CreateClicToPaySessionDto,
    caller: Caller,
    rawIdempotencyKey?: string,
  ): Promise<HostedPaymentSession> {
    const idempotencyKey = `${caller.userId}:clictopay:${
      rawIdempotencyKey?.trim() || randomUUID()
    }`;
    const replay = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (replay) {
      this.assertReplayMatches(replay, dto);
      await this.assertPaymentAccess(replay, caller);
      return this.toSession(replay);
    }

    const attempt =
      dto.purpose === PaymentPurpose.installment
        ? await this.createInstallmentAttempt(dto, caller, idempotencyKey)
        : await this.createTreatmentFeeAttempt(dto, caller, idempotencyKey);
    const payment = attempt.payment;

    if (
      !attempt.created ||
      payment.paymentUrl ||
      payment.status === PaymentRecordStatus.success
    ) {
      return this.toSession(payment);
    }

    const returnUrl = this.callbackUrl(env.clicToPay.returnUrl, payment.id);
    const failUrl = this.callbackUrl(env.clicToPay.failUrl, payment.id);

    try {
      const registration = await this.client.register({
        orderNumber: payment.merchantOrderNumber!,
        amount: ClicToPayClient.amountToMillimes(payment.amount),
        returnUrl,
        failUrl,
        language: dto.language ?? 'fr',
        pageView: dto.pageView,
      });
      const registered = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerOrderId: registration.orderId,
          transactionId: registration.orderId,
          paymentUrl: registration.formUrl,
          status: PaymentRecordStatus.pending,
          providerErrorCode: null,
          providerErrorMessage: null,
        },
      });
      this.logger.log(`ClicToPay session registered for payment ${payment.id}.`);
      return this.toSession(registered);
    } catch (error) {
      const failure = this.normaliseError(error);
      // A duplicate merchant reference can mean the first registration
      // reached ClicToPay but its response was lost. Never submit a second
      // charge: reconcile the original reference through the status API.
      if (failure.providerCode === '1') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentRecordStatus.unknown,
            providerErrorCode: failure.safeCode,
            providerErrorMessage: failure.message,
          },
        });
        return this.verify(payment.id, caller);
      }
      const status =
        failure.kind === 'ambiguous'
          ? PaymentRecordStatus.unknown
          : PaymentRecordStatus.failed;
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          providerErrorCode: failure.safeCode,
          providerErrorMessage: failure.message,
        },
      });
      this.logger.warn(
        `ClicToPay registration ${status} for payment ${payment.id} (${failure.safeCode}).`,
      );
      return this.toSession(updated);
    }
  }

  async verify(paymentId: string, caller: Caller): Promise<HostedPaymentSession> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.provider !== PaymentProvider.clictopay) {
      throw new NotFoundException('Payment not found.');
    }
    await this.assertPaymentAccess(payment, caller);
    if (
      payment.status === PaymentRecordStatus.success ||
      payment.status === PaymentRecordStatus.cancelled ||
      payment.status === PaymentRecordStatus.failed
    ) {
      return this.toSession(payment);
    }

    let providerStatus: ClicToPayStatus;
    try {
      providerStatus = await this.client.getStatus({
        orderId: payment.providerOrderId ?? undefined,
        orderNumber: payment.providerOrderId
          ? undefined
          : payment.merchantOrderNumber ?? undefined,
      });
    } catch (error) {
      const failure = this.normaliseError(error);
      const unknown = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.unknown,
          providerErrorCode: failure.safeCode,
          providerErrorMessage: failure.message,
          lastProviderCheckAt: new Date(),
          verificationCount: { increment: 1 },
        },
      });
      return this.toSession(unknown);
    }

    const mismatch = this.validateProviderIdentity(payment, providerStatus);
    if (mismatch) {
      const unknown = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.unknown,
          providerStatus: providerStatus.orderStatus,
          providerErrorCode: 'PAYMENT_PROVIDER_DATA_MISMATCH',
          providerErrorMessage: mismatch,
          lastProviderCheckAt: new Date(),
          verificationCount: { increment: 1 },
        },
      });
      this.logger.error(`ClicToPay identity mismatch for payment ${payment.id}.`);
      return this.toSession(unknown);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerStatus: providerStatus.orderStatus,
        providerErrorCode: null,
        providerErrorMessage: null,
        lastProviderCheckAt: new Date(),
        verificationCount: { increment: 1 },
      },
    });

    if (providerStatus.orderStatus === 2) {
      const settled =
        payment.purpose === PaymentPurpose.installment
          ? await this.payments.handleSuccess({
              paymentId: payment.id,
              transactionId: payment.providerOrderId ?? payment.merchantOrderNumber!,
              actor: caller,
            })
          : await this.settleTreatmentFee(payment.id);
      return this.toSession(settled);
    }

    const nextStatus = this.mapProviderStatus(providerStatus.orderStatus);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus },
    });
    return this.toSession(updated);
  }

  private async createInstallmentAttempt(
    dto: CreateClicToPaySessionDto,
    caller: Caller,
    idempotencyKey: string,
  ): Promise<{ payment: Payment; created: boolean }> {
    if (!dto.installmentId) {
      throw new BadRequestException(
        'installmentId is required for an installment payment.',
        'PAYMENT_INSTALLMENT_REQUIRED',
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE id = ${dto.installmentId} FOR UPDATE`;
      const installment = await tx.quoteInstallment.findUnique({
        where: { id: dto.installmentId },
        include: { quotation: { include: { order: true } } },
      });
      if (!installment || installment.quotation.deletedAt || installment.quotation.order.deletedAt) {
        throw new NotFoundException('Installment not found.');
      }
      if (installment.quotation.orderId !== dto.orderId) {
        throw new BadRequestException(
          'The installment does not belong to this order.',
          'PAYMENT_TARGET_MISMATCH',
        );
      }
      this.assertOrderAccess(installment.quotation.order.doctorId, caller);
      this.assertInstallmentPayable(installment);

      const live = await tx.payment.findFirst({
        where: {
          installmentId: installment.id,
          provider: PaymentProvider.clictopay,
          status: { in: LIVE_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (live) return { payment: live, created: false };

      const attemptNumber =
        (await tx.payment.count({
          where: { installmentId: installment.id, provider: PaymentProvider.clictopay },
        })) + 1;
      const payment = await tx.payment.create({
        data: {
          orderId: installment.quotation.orderId,
          quotationId: installment.quotationId,
          installmentId: installment.id,
          amount: installment.amount,
          currency: installment.quotation.currency ?? 'TND',
          purpose: PaymentPurpose.installment,
          provider: PaymentProvider.clictopay,
          status: PaymentRecordStatus.pending,
          paymentMethod: PaymentMethod.card,
          idempotencyKey,
          merchantOrderNumber: this.merchantReference(),
          attemptNumber,
          initiatedById: caller.userId,
        },
      });
      return { payment, created: true };
    });
    await this.quotations.approveOnFirstPayment(created.payment.quotationId!, caller);
    return created;
  }

  private async createTreatmentFeeAttempt(
    dto: CreateClicToPaySessionDto,
    caller: Caller,
    idempotencyKey: string,
  ): Promise<{ payment: Payment; created: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${dto.orderId} FOR UPDATE`;
      const order = await tx.dentalOrder.findUnique({ where: { id: dto.orderId } });
      if (!order || order.deletedAt) throw new NotFoundException('Order not found.');
      this.assertOrderAccess(order.doctorId, caller);
      if (order.treatmentFeePaidAt) {
        throw new BadRequestException(
          'The treatment fee is already paid.',
          'TREATMENT_FEE_ALREADY_PAID',
        );
      }

      const live = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          purpose: PaymentPurpose.treatment_fee,
          provider: PaymentProvider.clictopay,
          status: { in: LIVE_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (live) return { payment: live, created: false };

      const settings = await tx.companyBillingSettings.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { defaultTreatmentFee: true, defaultCurrency: true },
      });
      const amount = new Prisma.Decimal(settings?.defaultTreatmentFee ?? 0).add(
        order.cbctFeeAmount ?? 0,
      );
      if (!amount.isPositive()) {
        throw new BadRequestException(
          'The treatment fee is not configured.',
          'TREATMENT_FEE_NOT_CONFIGURED',
        );
      }
      const attemptNumber =
        (await tx.payment.count({
          where: {
            orderId: order.id,
            purpose: PaymentPurpose.treatment_fee,
            provider: PaymentProvider.clictopay,
          },
        })) + 1;
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          quotationId: null,
          installmentId: null,
          amount,
          currency: settings?.defaultCurrency ?? 'TND',
          purpose: PaymentPurpose.treatment_fee,
          provider: PaymentProvider.clictopay,
          status: PaymentRecordStatus.pending,
          paymentMethod: PaymentMethod.card,
          idempotencyKey,
          merchantOrderNumber: this.merchantReference(),
          attemptNumber,
          initiatedById: caller.userId,
        },
      });
      return { payment, created: true };
    });
  }

  private async settleTreatmentFee(paymentId: string): Promise<Payment> {
    const result = await this.prisma.$transaction(async (tx) => {
      const reference = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true },
      });
      if (!reference) throw new NotFoundException('Payment not found.');
      await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${reference.orderId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      const order = await tx.dentalOrder.findUnique({
        where: { id: reference.orderId },
        include: {
          doctor: { select: { fullName: true } },
          patient: { select: { fullName: true } },
        },
      });
      if (!payment || !order) throw new NotFoundException('Payment not found.');
      if (payment.status === PaymentRecordStatus.success) {
        return { payment, order, notify: false };
      }
      const now = new Date();
      const settled = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.success,
          paidAt: now,
          transactionId: payment.providerOrderId ?? payment.merchantOrderNumber,
        },
      });
      if (order.treatmentFeePaidAt) {
        return { payment: settled, order, notify: false };
      }
      const updatedOrder = await tx.dentalOrder.update({
        where: { id: order.id },
        data: {
          treatmentFeePaidAt: now,
          treatmentFeeAmount: payment.amount,
          treatmentFeePaymentMethod: PaymentMethod.card,
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
        },
        include: {
          doctor: { select: { fullName: true } },
          patient: { select: { fullName: true } },
        },
      });
      return { payment: settled, order: updatedOrder, notify: true };
    });

    if (result.notify) {
      this.events.emit(NotificationEvents.TreatmentFeePaid, {
        orderId: result.order.id,
        orderCode: result.order.orderCode,
        doctorId: result.order.doctorId,
        doctorName: result.order.doctor?.fullName ?? null,
        patientName: result.order.patient?.fullName ?? null,
        amount: result.payment.amount.toString(),
        currency: result.payment.currency,
        method: PaymentMethod.card,
      });
    }
    return result.payment;
  }

  private async assertPaymentAccess(payment: Payment, caller: Caller): Promise<void> {
    if (isAdmin(caller)) return;
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: payment.orderId },
      select: { doctorId: true },
    });
    if (!order || caller.role !== UserRole.dentist || order.doctorId !== caller.userId) {
      throw new ForbiddenException('You cannot access this payment.');
    }
  }

  private assertOrderAccess(doctorId: string, caller: Caller): void {
    if (isAdmin(caller)) return;
    if (caller.role !== UserRole.dentist || caller.userId !== doctorId) {
      throw new ForbiddenException('You can only pay for your own orders.');
    }
  }

  private assertInstallmentPayable(installment: {
    status: InstallmentStatus;
    availableFrom: Date;
    quotation: { status: QuotationStatus };
  }): void {
    if (
      installment.quotation.status !== QuotationStatus.sent &&
      installment.quotation.status !== QuotationStatus.approved
    ) {
      throw new BadRequestException('The quotation is not payable.');
    }
    if (installment.status === InstallmentStatus.paid) {
      throw new BadRequestException('This installment is already paid.');
    }
    if (installment.status === InstallmentStatus.cancelled) {
      throw new BadRequestException('This installment is cancelled.');
    }
    if (installment.availableFrom.getTime() > Date.now()) {
      throw new BadRequestException('This installment is not available yet.');
    }
  }

  private validateProviderIdentity(
    payment: Payment,
    status: ClicToPayStatus,
  ): string | null {
    if (
      status.orderNumber &&
      status.orderNumber !== payment.merchantOrderNumber
    ) {
      return 'The provider returned a different merchant order reference.';
    }
    const expectedAmount = ClicToPayClient.amountToMillimes(payment.amount);
    if (status.amount !== undefined && status.amount !== expectedAmount) {
      return 'The provider returned a different payment amount.';
    }
    if (status.currency !== undefined && status.currency !== env.clicToPay.currency) {
      return 'The provider returned a different currency.';
    }
    return null;
  }

  private mapProviderStatus(status: number): PaymentRecordStatus {
    switch (status) {
      case 0:
      case 1:
      case 5:
        return PaymentRecordStatus.pending;
      case 3:
      case 4:
        return PaymentRecordStatus.cancelled;
      case 6:
        return PaymentRecordStatus.failed;
      default:
        return PaymentRecordStatus.unknown;
    }
  }

  private callbackUrl(configuredUrl: string | undefined, paymentId: string): string {
    if (!configuredUrl) {
      throw new AppException(
        503,
        'Card payments are temporarily unavailable.',
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
      );
    }
    const url = new URL(configuredUrl);
    url.searchParams.set('paymentId', paymentId);
    return url.toString();
  }

  private merchantReference(): string {
    return `ORA-${Date.now().toString(36)}-${randomUUID().replace(/-/g, '').slice(0, 12)}`
      .toUpperCase()
      .slice(0, 32);
  }

  private assertReplayMatches(payment: Payment, dto: CreateClicToPaySessionDto): void {
    if (
      payment.orderId !== dto.orderId ||
      payment.purpose !== dto.purpose ||
      (dto.installmentId && payment.installmentId !== dto.installmentId)
    ) {
      throw new BadRequestException(
        'This idempotency key was already used for another payment.',
        'PAYMENT_IDEMPOTENCY_CONFLICT',
      );
    }
  }

  private normaliseError(error: unknown): ClicToPayError {
    if (error instanceof ClicToPayError) return error;
    return new ClicToPayError(
      'ambiguous',
      'PAYMENT_PROVIDER_UNREACHABLE',
      'The payment provider could not be reached. The payment status is unknown.',
    );
  }

  private toSession(payment: Payment): HostedPaymentSession {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      quotationId: payment.quotationId,
      installmentId: payment.installmentId,
      purpose: payment.purpose,
      status: payment.status,
      providerStatus: payment.providerStatus,
      amount: payment.amount.toString(),
      currency: payment.currency,
      paymentUrl: payment.paymentUrl,
      errorCode: payment.providerErrorCode,
      errorMessage: payment.providerErrorMessage,
    };
  }
}
