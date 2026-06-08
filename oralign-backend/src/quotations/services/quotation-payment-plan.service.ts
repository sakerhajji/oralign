import { Injectable, Logger } from '@nestjs/common';
import {
  ArchType,
  BatchStatus,
  InstallmentStatus,
  OrderStatus,
  PaymentMode,
  Prisma,
  Quotation,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { PackService } from '../../packs/services/pack.service';
import {
  AttachPackToQuotationDto,
  ConfigurePaymentPlanDto,
} from '../dto/quotation.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';

type Caller = { userId: string; role: UserRole };

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

const MONEY_EPSILON = new Prisma.Decimal('0.001');

/**
 * Service dedicated to the pack-aware quotation lifecycle:
 *   • attachPack    — admin picks a pack + arch, snapshot is taken,
 *                     totalPrice is set from the active PackPrice.
 *   • configurePaymentPlan — admin defines installments + batches.
 *                            Wraps validation + transactional write.
 *
 * Kept SEPARATE from the legacy QuotationService so the existing
 * Float-based flow (treatmentFees + tva → totalTtc) keeps working
 * untouched. Both services coexist on the same Quotation row; a
 * "legacy" quote has `packId = null` and continues to operate
 * through QuotationService alone.
 */
@Injectable()
export class QuotationPaymentPlanService {
  private readonly logger = new Logger(QuotationPaymentPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly packs: PackService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Snapshot a pack + active price onto a quote. Refuses to mutate
   * a quote that's already in flight (approved or with payments
   * received) — those must be cancelled + re-issued.
   */
  async attachPack(
    quotationId: string,
    dto: AttachPackToQuotationDto,
    caller: Caller,
  ): Promise<Quotation> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException('Only admins can attach a pack to a quote.');
    }
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { payments: { where: { status: 'success' }, select: { id: true } } },
    });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found');
    }
    if (quote.status === QuotationStatus.approved) {
      throw new BadRequestException(
        'Cannot change the pack of an approved quote.',
      );
    }
    if (quote.payments.length > 0) {
      throw new BadRequestException(
        'Cannot change the pack — at least one payment has been recorded.',
      );
    }

    // archType defaults to two_arches — the admin UI consolidated to
    // a single price per pack, so callers no longer need to specify
    // which arch. Legacy callers that DID pass an arch are honoured.
    const archType = dto.archType ?? ArchType.two_arches;
    const { pack, price } = await this.packs.getActivePriceForQuote(
      dto.packId,
      archType,
    );

    // Reset any previously-configured plan because the totals just
    // changed. Doing this inside the same transaction guarantees the
    // new snapshot + new totalPrice land atomically with the wiped
    // installments + batches.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quoteStepBatch.deleteMany({ where: { quotationId } });
      await tx.quoteInstallment.deleteMany({ where: { quotationId } });
      return tx.quotation.update({
        where: { id: quotationId },
        data: {
          packId: pack.id,
          packName: pack.name,
          archType,
          maxStepsPerArch: pack.maxStepsPerArch,
          includedCorrections: pack.includedCorrections,
          isUnlimitedSteps: pack.isUnlimitedSteps,
          isUnlimitedCorrections: pack.isUnlimitedCorrections,
          isForOrthodontists: pack.isForOrthodontists,
          totalPrice: price.price,
          paidAmount: new Prisma.Decimal(0),
          remainingAmount: price.price,
          paymentMode: null,
          paymentStatus: QuotationPaymentStatus.pending,
          currency: price.currency,
          // Mirror the new price onto the legacy Float column too so the
          // PDF renderer + existing UI stay in sync. The legacy treatment/
          // fab/delivery breakdown is set to zero — for pack-based quotes
          // the price IS the bundle.
          treatmentFees: Number(price.price),
          fabricationFees: 0,
          deliveryFees: 0,
          discountAmount: 0,
          subTotalHt: Number(price.price),
          tvaAmount: 0,
          tvaRate: 0,
          totalTtc: Number(price.price),
        },
      });
    });

    this.logger.log(
      `Attached pack ${pack.name} (${archType}) to quote ${quotationId} by ${caller.userId}`,
    );
    return updated;
  }

  /**
   * Define the installment + batch plan. Validation is intentionally
   * heavy — every cross-field check that the spec calls out lives
   * here so the DB is never asked to enforce a business rule.
   */
  async configurePaymentPlan(
    quotationId: string,
    dto: ConfigurePaymentPlanDto,
    caller: Caller,
  ): Promise<Quotation> {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can configure the payment plan.',
      );
    }
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { payments: { where: { status: 'success' }, select: { id: true } } },
    });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found');
    }
    if (!quote.packId || !quote.totalPrice) {
      throw new BadRequestException(
        'Attach a pack first — payment plan requires a snapshotted total price.',
      );
    }
    if (quote.status === QuotationStatus.approved) {
      throw new BadRequestException(
        'Cannot edit the payment plan of an approved quote.',
      );
    }
    if (quote.payments.length > 0) {
      throw new BadRequestException(
        'Cannot edit the payment plan — at least one payment has been recorded.',
      );
    }

    // ── Validation pass ─────────────────────────────────────────
    if (
      dto.paymentMode === PaymentMode.full_payment &&
      dto.installments.length !== 1
    ) {
      throw new BadRequestException(
        'FULL_PAYMENT requires exactly one installment.',
      );
    }
    if (
      dto.paymentMode === PaymentMode.installments &&
      dto.installments.length < 2
    ) {
      throw new BadRequestException(
        'INSTALLMENTS requires at least two installments.',
      );
    }

    // Range checks per installment.
    const maxStep = quote.isUnlimitedSteps
      ? Number.POSITIVE_INFINITY
      : (quote.maxStepsPerArch ?? 0);
    if (!quote.isUnlimitedSteps && maxStep === 0) {
      throw new BadRequestException(
        'Pack snapshot is missing maxStepsPerArch.',
      );
    }

    const rows = dto.installments.map((row, idx) => ({
      idx,
      amount: new Prisma.Decimal(row.amount.toFixed(3)),
      availableFrom: row.availableFrom ? new Date(row.availableFrom) : new Date(),
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
      fromStep: row.batch.fromStep,
      toStep: row.batch.toStep,
    }));

    for (const row of rows) {
      if (row.fromStep > row.toStep) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: fromStep must be ≤ toStep.`,
        );
      }
      if (!quote.isUnlimitedSteps && row.toStep > maxStep) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: step range exceeds pack max (${maxStep}).`,
        );
      }
      if (row.dueDate && row.dueDate < row.availableFrom) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: dueDate cannot precede availableFrom.`,
        );
      }
    }

    // Overlap check — sort by fromStep then ensure each row starts
    // strictly after the previous row's toStep.
    const sorted = [...rows].sort((a, b) => a.fromStep - b.fromStep);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.fromStep <= sorted[i - 1]!.toStep) {
        throw new BadRequestException(
          `Step ranges overlap between installments #${sorted[i - 1]!.idx + 1} and #${
            sorted[i]!.idx + 1
          }.`,
        );
      }
    }

    // Σ amounts must equal totalPrice. Decimal arithmetic so we don't
    // hit Number precision artefacts.
    const sum = rows.reduce(
      (acc, row) => acc.plus(row.amount),
      new Prisma.Decimal(0),
    );
    const diff = sum.minus(quote.totalPrice).abs();
    if (diff.gt(MONEY_EPSILON)) {
      throw new BadRequestException(
        `Installment amounts (Σ ${sum.toString()}) must equal totalPrice ` +
          `${quote.totalPrice.toString()}. Difference: ${diff.toString()}.`,
      );
    }

    // ── Write inside one transaction ────────────────────────────
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.quoteStepBatch.deleteMany({ where: { quotationId } });
      await tx.quoteInstallment.deleteMany({ where: { quotationId } });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const installment = await tx.quoteInstallment.create({
          data: {
            quotationId,
            installmentNumber: i + 1,
            amount: row.amount,
            availableFrom: row.availableFrom,
            dueDate: row.dueDate,
            status: InstallmentStatus.pending,
          },
        });
        await tx.quoteStepBatch.create({
          data: {
            quotationId,
            installmentId: installment.id,
            batchNumber: i + 1,
            fromStep: row.fromStep,
            toStep: row.toStep,
            status: BatchStatus.locked,
          },
        });
      }

      return tx.quotation.update({
        where: { id: quotationId },
        data: { paymentMode: dto.paymentMode },
      });
    });

    this.logger.log(
      `Configured payment plan (${dto.paymentMode}, ${rows.length} installments) on quote ${quotationId}`,
    );
    return result;
  }

  /**
   * Doctor-or-admin approval that ALSO progresses the order into the
   * payment phase when the quote carries a pack. Legacy quotes (no
   * packId) skip this branch and remain on the existing approve()
   * path.
   *
   * Returns true when this method took ownership (pack quote); false
   * when the legacy QuotationService.approve should run instead.
   */
  async tryApprovePackQuote(
    quote: Quotation,
    caller: Caller,
  ): Promise<boolean> {
    if (!quote.packId) return false;

    // Quote MUST have a fully configured plan or doctor cannot approve.
    // This should normally be caught earlier (QuotationService.send
    // refuses to dispatch pack quotes without a plan), but we keep the
    // guard here for legacy data and race-condition safety. The error
    // copy targets BOTH audiences — doctors get a clear "talk to the
    // clinic" path, admins get a clear next step.
    const planRowCount = await this.prisma.quoteInstallment.count({
      where: { quotationId: quote.id },
    });
    if (planRowCount === 0) {
      throw new BadRequestException(
        'The payment plan for this quote is not configured yet. Please ask the clinic admin to finalise the installments before you approve.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById: caller.userId,
          doctorApprovedAt: new Date(),
          paymentStatus: QuotationPaymentStatus.pending,
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.payment_plan_selected },
      });
    });
    return true;
  }

  /**
   * Read the plan (installments + batches) for a quote — exposed
   * to both admin + doctor (the controller checks ownership).
   */
  async getPlan(quotationId: string) {
    const [installments, batches] = await Promise.all([
      this.prisma.quoteInstallment.findMany({
        where: { quotationId },
        orderBy: { installmentNumber: 'asc' },
      }),
      this.prisma.quoteStepBatch.findMany({
        where: { quotationId },
        orderBy: { batchNumber: 'asc' },
      }),
    ]);
    // Mark overdue on read — cheap derivation, no scheduler needed.
    const now = Date.now();
    const annotated = installments.map((row) =>
      row.status === InstallmentStatus.pending &&
      row.dueDate &&
      row.dueDate.getTime() < now
        ? { ...row, status: InstallmentStatus.overdue }
        : row,
    );
    return { installments: annotated, batches };
  }

  /**
   * Mark a step batch as delivered. Admin only. The batch MUST be
   * `unlocked` — locked batches can never deliver, delivered batches
   * are idempotently kept in that state.
   */
  async deliverBatch(
    batchId: string,
    caller: Caller,
  ) {
    if (!ADMIN_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        'Only admins can mark a batch as delivered.',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.quoteStepBatch.findUnique({
        where: { id: batchId },
        include: {
          quotation: {
            select: {
              orderId: true,
              // Pull the full doctor + patient + orderCode bundle so
              // BatchDelivered can render the doctor's bell as
              // "Steps X–Y for patient Z (ORD-…) have been
              // delivered." Without these joins the listener would
              // have to refetch the order — wasteful.
              order: {
                select: {
                  doctorId: true,
                  orderCode: true,
                  doctor: { select: { fullName: true } },
                  patient: { select: { fullName: true } },
                },
              },
            },
          },
        },
      });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status === BatchStatus.locked) {
        throw new BadRequestException(
          'Locked batches cannot be delivered — wait for the linked installment to be paid.',
        );
      }
      if (batch.status === BatchStatus.delivered) {
        // Idempotent — return the row as-is and skip the notification
        // so re-clicking "Deliver" doesn't double-ping the doctor.
        return { batch, justDelivered: false };
      }
      const updated = await tx.quoteStepBatch.update({
        where: { id: batchId },
        data: {
          status: BatchStatus.delivered,
          deliveredAt: new Date(),
          deliveredById: caller.userId,
        },
      });
      return {
        batch: { ...updated, quotation: batch.quotation },
        justDelivered: true,
      };
    });

    if (result.justDelivered) {
      // Tell the doctor their aligners are on the way.
      const order = result.batch.quotation.order;
      this.events.emit(NotificationEvents.BatchDelivered, {
        batchId: result.batch.id,
        quotationId: result.batch.quotationId,
        orderId: result.batch.quotation.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        fromStep: result.batch.fromStep,
        toStep: result.batch.toStep,
        batchNumber: result.batch.batchNumber,
      });
    }

    return result.batch;
  }
}
