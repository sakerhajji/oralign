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
import { toAmount, type PaymentCharge } from '../../common/billing/tax-split';
import {
  AppException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  NotificationEvents,
  type TreatmentFeeEvent,
} from '../../notifications/events/notification-events';
import { assertTreatmentFeeApplies } from '../../orders/order-kind';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotationService } from '../../quotations/services/quotation.service';
import { ClicToPayClient } from '../clictopay/clictopay.client';
import { ClicToPayError, ClicToPayStatus } from '../clictopay/clictopay.types';
import { CreateClicToPaySessionDto } from '../dto/payment.dto';
import {
  appliesWithholding,
  assertNoOtherPaymentInFlight,
  chargesTheSame,
  expectedCharge,
  PAYMENT_CHARGE_CHANGED,
  paymentChargeData,
  paymentGross,
  paymentSettled,
  readChargeSettings,
  resolvePaymentCharge,
  toRate,
  treatmentFeeDue,
  WITHHOLDING_CHOICE_CONFLICT,
} from './payment-rules';
import { PaymentsService } from './payments.service';

const LIVE_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.pending,
  PaymentRecordStatus.unknown,
];

/**
 * Background reconciliation has no HTTP principal. Card settlement never
 * writes an actor to a foreign key (`confirmedById` stays null for cards), so
 * this synthetic caller only ever satisfies the admin access check.
 */
const RECONCILIATION_CALLER: Caller = {
  userId: 'system:clictopay-reconciliation',
  role: UserRole.super_admin,
};

/**
 * A live attempt opened with the other retenue choice charges another
 * amount: handing it back would charge what the practitioner did not ask
 * for, and opening a second one beside it risks two charges.
 */
const WITHHOLDING_CHOICE_CONFLICT_MESSAGE =
  "Un paiement par carte est déjà ouvert pour ce montant avec un autre choix de retenue à la source. Terminez ce paiement, ou attendez son expiration (une quinzaine de minutes), avant d'en lancer un nouveau.";

/**
 * A live attempt opened before the stamp, the retenue rate or the amount
 * due changed charges another figure than the one shown now: handing it
 * back would charge what the practitioner was not shown.
 */
const PAYMENT_CHARGE_CHANGED_MESSAGE =
  "Un paiement par carte est déjà ouvert pour ce montant, à un tarif qui a changé depuis (droit de timbre ou retenue à la source). Terminez ce paiement, ou attendez son expiration (une quinzaine de minutes), avant d'en lancer un nouveau.";

export interface HostedPaymentSession {
  paymentId: string;
  orderId: string;
  quotationId: string | null;
  installmentId: string | null;
  purpose: PaymentPurpose;
  status: PaymentRecordStatus;
  providerStatus: number | null;
  /**
   * The amount charged on the card: the due + the stamp, minus the
   * retenue when one applies.
   */
  amount: string;
  withholdingRate: number | null;
  withholdingAmount: number;
  /** The droit de timbre charged on top (0 on attempts before 2026-11-20). */
  stampAmount: number;
  /** amount + withholdingAmount: the total of the facture, stamp included. */
  grossAmount: number;
  /** amount + withholdingAmount - stampAmount: what the payment settles. */
  settledAmount: number;
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
        // The legacy route takes no body: the full amount, no retenue.
        applyWithholding: false,
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

    // A customer who comes back later must never be handed a dead hosted
    // session. Resolved before the attempt transaction so the gateway lookup
    // never runs while a row lock is held.
    const resumable = await this.resolveLiveAttempt(dto, caller);
    if (resumable) return this.toSession(resumable);

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
          expiresAt: new Date(Date.now() + env.clicToPay.sessionTtlMs),
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
      // `Order not found` on an attempt that never obtained a provider order id
      // is definitive: no charge exists under this reference, so the attempt is
      // retired instead of blocking the customer behind a permanent `unknown`.
      const neverRegistered =
        failure.providerCode === '6' && !payment.providerOrderId;
      const settled = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: neverRegistered
            ? PaymentRecordStatus.failed
            : PaymentRecordStatus.unknown,
          providerErrorCode: failure.safeCode,
          providerErrorMessage: failure.message,
          lastProviderCheckAt: new Date(),
          verificationCount: { increment: 1 },
        },
      });
      return this.toSession(settled);
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
    // Registered, never paid, past its deadline: the hosted session is dead.
    // Surfacing it as EXPIRED is what lets the return page offer a fresh
    // attempt instead of sending the customer back to a dead URL.
    if (nextStatus === PaymentRecordStatus.pending && this.isSessionStale(updated)) {
      await this.expireSession(updated.id);
      const expired = await this.prisma.payment.findUnique({
        where: { id: updated.id },
      });
      if (expired) return this.toSession(expired);
    }
    return this.toSession(updated);
  }

  /**
   * Reconciliation entry point for the background sweep: the very verification
   * the customer's return page performs, without an HTTP principal.
   */
  async reconcile(paymentId: string): Promise<HostedPaymentSession> {
    return this.verify(paymentId, RECONCILIATION_CALLER);
  }

  /**
   * Decide what to do with the attempt already in flight for this target.
   *
   * The gateway is always asked before an attempt is retired: a customer may
   * have paid in the final seconds, and a locally-expired row would strand
   * that money. Returns the attempt to hand back, or null when opening a
   * fresh one is safe.
   */
  private async resolveLiveAttempt(
    dto: CreateClicToPaySessionDto,
    caller: Caller,
  ): Promise<Payment | null> {
    const where = this.liveAttemptWhere(dto);
    if (!where) return null;
    const live = await this.prisma.payment.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (!live) return null;
    await this.assertPaymentAccess(live, caller);
    if (this.isSessionUsable(live)) {
      // Alive: it can still be paid, so it can be neither expired nor
      // handed back with an amount the practitioner did not choose, or
      // that the settings no longer give.
      await this.assertResumable(live, dto);
      return live;
    }

    const verified = await this.verify(live.id, caller);
    // Paid: the target is settled, whatever was chosen this time.
    if (verified.status === PaymentRecordStatus.success) {
      return this.prisma.payment.findUnique({ where: { id: live.id } });
    }
    // Still undecided: never open a second charge against it.
    if (verified.status === PaymentRecordStatus.unknown) {
      await this.assertResumable(live, dto);
      return this.prisma.payment.findUnique({ where: { id: live.id } });
    }
    // Proven dead by the gateway: a fresh attempt may follow, with either
    // choice.
    if (verified.status === PaymentRecordStatus.pending) {
      await this.expireSession(live.id);
    }
    return null;
  }

  /**
   * 409 WITHHOLDING_CHOICE_CONFLICT when a live attempt carries the other
   * retenue choice: its own code, so the client can explain it without
   * mistaking it for a card or transfer of another kind in flight
   * (PAYMENT_ATTEMPT_IN_PROGRESS).
   */
  private assertSameWithholdingChoice(
    live: Payment,
    dto: CreateClicToPaySessionDto,
  ): void {
    if (appliesWithholding(live) === Boolean(dto.applyWithholding)) return;
    throw new ConflictException(
      WITHHOLDING_CHOICE_CONFLICT_MESSAGE,
      WITHHOLDING_CHOICE_CONFLICT,
    );
  }

  /**
   * 409 PAYMENT_CHARGE_CHANGED when a live attempt with the same retenue
   * choice charges another figure than a new attempt would now (cash,
   * retenue or stamp): it was opened before the stamp, the retenue rate or
   * the amount due changed. Like the choice check, it is never handed back
   * then, and never doubled: the practitioner finishes it or lets it expire.
   */
  private assertSameCharge(live: Payment, charge: PaymentCharge): void {
    if (chargesTheSame(live, charge)) return;
    throw new ConflictException(
      PAYMENT_CHARGE_CHANGED_MESSAGE,
      PAYMENT_CHARGE_CHANGED,
    );
  }

  /**
   * A live attempt found before the attempt transaction may be handed back
   * only with the retenue choice asked for and the charge a new attempt
   * would carry now. The charge is read without a lock: the transaction's
   * own backstop re-checks it under the row lock.
   */
  private async assertResumable(
    live: Payment,
    dto: CreateClicToPaySessionDto,
  ): Promise<void> {
    this.assertSameWithholdingChoice(live, dto);
    const charge = await this.currentCharge(dto);
    if (charge) this.assertSameCharge(live, charge);
  }

  /**
   * What a new attempt on this target would charge as things stand. Null
   * when the target cannot be priced (it vanished): the attempt
   * transaction refuses it.
   */
  private async currentCharge(
    dto: CreateClicToPaySessionDto,
  ): Promise<PaymentCharge | null> {
    if (dto.purpose === PaymentPurpose.installment) {
      if (!dto.installmentId) return null;
      const installment = await this.prisma.quoteInstallment.findUnique({
        where: { id: dto.installmentId },
        select: { amount: true },
      });
      if (!installment) return null;
      return expectedCharge(
        dto.applyWithholding,
        installment.amount,
        await readChargeSettings(this.prisma),
      );
    }
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: dto.orderId },
      select: { cbctFeeAmount: true },
    });
    if (!order) return null;
    const settings = await this.readFeeSettings(this.prisma);
    return expectedCharge(
      dto.applyWithholding,
      treatmentFeeDue(settings?.defaultTreatmentFee, order.cbctFeeAmount),
      settings ?? {},
    );
  }

  /** The settings a treatment-fee attempt is priced with. */
  private readFeeSettings(
    db: Pick<Prisma.TransactionClient, 'companyBillingSettings'>,
  ) {
    return db.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        defaultTreatmentFee: true,
        defaultCurrency: true,
        withholdingRate: true,
        stampDuty: true,
      },
    });
  }

  private liveAttemptWhere(
    dto: CreateClicToPaySessionDto,
  ): Prisma.PaymentWhereInput | null {
    const base = {
      provider: PaymentProvider.clictopay,
      status: { in: LIVE_STATUSES },
    };
    if (dto.purpose === PaymentPurpose.installment) {
      return dto.installmentId ? { ...base, installmentId: dto.installmentId } : null;
    }
    return { ...base, orderId: dto.orderId, purpose: PaymentPurpose.treatment_fee };
  }

  /** Usable: still pending, with a hosted URL, and before its deadline. */
  private isSessionUsable(payment: Payment): boolean {
    return (
      payment.status === PaymentRecordStatus.pending &&
      !!payment.paymentUrl &&
      !!payment.expiresAt &&
      payment.expiresAt.getTime() > Date.now()
    );
  }

  /**
   * Provably past its deadline. An attempt that has none is still being
   * registered by a concurrent request, and reusing it is what makes a
   * double click safe.
   */
  private isSessionStale(payment: Payment): boolean {
    return !!payment.expiresAt && payment.expiresAt.getTime() <= Date.now();
  }

  /** Compare-and-set: a concurrent settlement must never be downgraded. */
  private async expireSession(paymentId: string): Promise<void> {
    const changed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: LIVE_STATUSES } },
      data: this.expiredPatch(),
    });
    if (changed.count) {
      this.logger.log(`ClicToPay session expired for payment ${paymentId}.`);
    }
  }

  private async expireWithin(
    tx: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<void> {
    await tx.payment.updateMany({
      where: { id: paymentId, status: { in: LIVE_STATUSES } },
      data: this.expiredPatch(),
    });
  }

  private expiredPatch(): Prisma.PaymentUpdateManyMutationInput {
    return {
      status: PaymentRecordStatus.expired,
      expiredAt: new Date(),
      providerErrorCode: 'PAYMENT_SESSION_EXPIRED',
      providerErrorMessage:
        'The hosted payment session expired before the payment was completed.',
    };
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
      // A transfer awaiting the admin is another payment of the same
      // installment: 409 rather than a second charge.
      await assertNoOtherPaymentInFlight(tx, installment.id, PaymentMethod.card);

      const live = await tx.payment.findFirst({
        where: {
          installmentId: installment.id,
          provider: PaymentProvider.clictopay,
          status: { in: LIVE_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });
      const settings = await readChargeSettings(tx);
      // Concurrency backstop: a double click finds the attempt its sibling
      // request just opened. Only a provably stale one is skipped — an attempt
      // still being registered has no deadline yet and must be reused, as
      // long as it charges what a new one would.
      if (live && !this.isSessionStale(live)) {
        this.assertSameWithholdingChoice(live, dto);
        this.assertSameCharge(
          live,
          expectedCharge(dto.applyWithholding, installment.amount, settings),
        );
        return { payment: live, created: false };
      }
      if (live) await this.expireWithin(tx, live.id);

      // The card is charged the cash: the installment + the stamp, minus
      // the retenue when applied; both ride beside it.
      const charge = resolvePaymentCharge(
        dto.applyWithholding,
        installment.amount,
        settings,
      );
      const attemptNumber =
        (await tx.payment.count({
          where: { installmentId: installment.id, provider: PaymentProvider.clictopay },
        })) + 1;
      const payment = await tx.payment.create({
        data: {
          orderId: installment.quotation.orderId,
          quotationId: installment.quotationId,
          installmentId: installment.id,
          ...paymentChargeData(charge),
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
      assertTreatmentFeeApplies(order);
      if (order.treatmentFeePaidAt) {
        throw new BadRequestException(
          'The treatment fee is already paid.',
          'TREATMENT_FEE_ALREADY_PAID',
        );
      }
      // Welcome gift: the whole charge was waived at submit.
      // Read under the row lock above, so a submit that applies the gift
      // and this attempt can never both win.
      if (order.welcomeGiftAppliedAt) {
        throw new BadRequestException(
          "Nothing to pay: this case's fees are covered by the welcome gift.",
          'WELCOME_GIFT_NOTHING_DUE',
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
      // Concurrency backstop: a double click finds the attempt its sibling
      // request just opened. Only a provably stale one is skipped — an attempt
      // still being registered has no deadline yet and must be reused, as
      // long as it charges what a new one would.
      const reusable = live && !this.isSessionStale(live) ? live : null;
      if (reusable) this.assertSameWithholdingChoice(reusable, dto);

      const settings = await this.readFeeSettings(tx);
      const due = treatmentFeeDue(
        settings?.defaultTreatmentFee,
        order.cbctFeeAmount,
      );
      if (reusable) {
        this.assertSameCharge(
          reusable,
          expectedCharge(dto.applyWithholding, due, settings ?? {}),
        );
        return { payment: reusable, created: false };
      }
      if (live) await this.expireWithin(tx, live.id);

      // gt(0), not isPositive(): Decimal.js counts 0 as positive.
      if (!due.gt(0)) {
        throw new BadRequestException(
          'The treatment fee is not configured.',
          'TREATMENT_FEE_NOT_CONFIGURED',
        );
      }
      // The card is charged the cash: the fee + CBCT + the stamp, minus the
      // retenue when applied. Settlement copies retenue and stamp onto the
      // order.
      const charge = resolvePaymentCharge(
        dto.applyWithholding,
        due,
        settings ?? {},
      );
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
          ...paymentChargeData(charge),
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
      const applied = appliesWithholding(payment);
      const updatedOrder = await tx.dentalOrder.update({
        where: { id: order.id },
        data: {
          treatmentFeePaidAt: now,
          // The cash collected; the fee due is this + the retenue - the
          // stamp, both copied from the attempt the card was charged with.
          treatmentFeeAmount: payment.amount,
          treatmentFeeWithholdingRate: applied ? payment.withholdingRate : null,
          treatmentFeeWithholdingAmount: applied
            ? payment.withholdingAmount
            : null,
          treatmentFeeStampAmount: payment.stampAmount,
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
        withholdingAmount: result.payment.withholdingAmount.toString(),
        stampAmount: result.payment.stampAmount.toString(),
        currency: result.payment.currency,
        method: PaymentMethod.card,
        paymentId: result.payment.id,
      } satisfies TreatmentFeeEvent);
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
      (dto.installmentId && payment.installmentId !== dto.installmentId) ||
      // Another retenue choice is another amount: not a replay.
      appliesWithholding(payment) !== Boolean(dto.applyWithholding)
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
      withholdingRate: toRate(payment.withholdingRate),
      withholdingAmount: toAmount(payment.withholdingAmount),
      stampAmount: toAmount(payment.stampAmount),
      grossAmount: toAmount(paymentGross(payment)),
      settledAmount: toAmount(paymentSettled(payment)),
      currency: payment.currency,
      paymentUrl: payment.paymentUrl,
      errorCode: payment.providerErrorCode,
      errorMessage: payment.providerErrorMessage,
    };
  }
}
