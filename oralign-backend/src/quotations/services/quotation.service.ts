import { Injectable, Logger } from '@nestjs/common';
import {
  CompanyBillingSettings,
  DentistProfile,
  DevisLanguage,
  OrderStatus,
  Prisma,
  Quotation,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  CreateQuotationDto,
  QuotationFilterDto,
  UpdateQuotationDto,
} from '../dto/quotation.dto';
import { CompanyBillingSettingsService } from './company-billing-settings.service';
import { pickTranslation } from './quotation-i18n';
import { QuotationPaymentPlanService } from './quotation-payment-plan.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { isAdmin, type Caller } from '../../common/access/caller';

/** Round to 3 decimal places — TND is 3-decimal officially. */
const round = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

export interface QuoteTotals {
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
}

/**
 * Quotation lifecycle service.
 *
 * Lifecycle:
 *   draft → admin creates + iterates on fees + language
 *   sent  → admin sends to doctor; quotationNumber + snapshot frozen
 *   approved → doctor approved; order moves to `fabrication`
 *   rejected → doctor rejected; order moves to `canceled`
 *   canceled → admin canceled (e.g. to re-issue a fresh quote)
 *
 * Snapshots — see Prisma comments. `companySnapshot` mirrors
 * CompanyBillingSettings at send time, `clinicSnapshot` mirrors the
 * doctor's DentistProfile at the same moment, so the PDF remains
 * faithful to the moment of issue no matter what admins / doctors edit
 * later.
 */
@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
    private readonly settingsService: CompanyBillingSettingsService,
    private readonly paymentPlan: QuotationPaymentPlanService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Authorisation helpers ────────────────────────────────────────────────

  /**
   * Returns the order if the caller can READ it (admin, owning dentist,
   * or assigned designer). Throws otherwise.
   */
  private assertOrderReadable(orderId: string, caller: Caller) {
    // Delegates to the single shared rule (common/access/order-access.policy).
    return this.orderAccess.requireReadable(orderId, caller);
  }

  /**
   * Publish a quote decision on the event bus. The notification listener
   * owns every side effect (admin e-mail today; in-app / WS tomorrow) so
   * this service never talks to MailService directly. Fire-and-forget:
   * a listener failure must not unwind the approve/reject transaction.
   */
  private emitQuoteDecision(
    quote: Pick<Quotation, 'id' | 'orderId' | 'quotationNumber' | 'language'>,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): void {
    void this.prisma.dentalOrder
      .findUnique({
        where: { id: quote.orderId },
        select: {
          orderCode: true,
          doctorId: true,
          doctor: { select: { fullName: true } },
          patient: { select: { fullName: true } },
        },
      })
      .then((order) => {
        if (!order) return;
        this.events.emit(
          decision === 'approved'
            ? NotificationEvents.QuotationApproved
            : NotificationEvents.QuotationRejected,
          {
            quotationId: quote.id,
            orderId: quote.orderId,
            orderCode: order.orderCode ?? null,
            doctorId: order.doctorId,
            doctorName: order.doctor?.fullName ?? null,
            patientName: order.patient?.fullName ?? null,
            language: quote.language ?? null,
            quotationNumber: quote.quotationNumber ?? null,
            decision,
            reason: reason ?? null,
          },
        );
      })
      .catch(() => {
        /* logged by the listener's safe(); nothing to unwind here */
      });
  }

  private async loadQuotation(id: string): Promise<Quotation> {
    const quote = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found.');
    }
    return quote;
  }

  // ─── Calculations ─────────────────────────────────────────────────────────

  /**
   * Pure function — derives the three calculated fields from fees,
   * discount, and TVA rate. Single source of truth so the front-end's
   * live preview and the persisted record always agree.
   */
  static computeTotals(
    treatmentFees: number,
    fabricationFees: number,
    deliveryFees: number,
    discountAmount: number,
    tvaRate: number,
  ): QuoteTotals {
    const grossFees =
      Math.max(0, treatmentFees) +
      Math.max(0, fabricationFees) +
      Math.max(0, deliveryFees);
    const discount = Math.min(Math.max(0, discountAmount), grossFees);
    const subTotalHt = grossFees - discount;
    const safeRate = Math.max(0, Math.min(100, tvaRate));
    const tvaAmount = (subTotalHt * safeRate) / 100;
    const totalTtc = subTotalHt + tvaAmount;
    return {
      subTotalHt: round(subTotalHt),
      tvaAmount: round(tvaAmount),
      totalTtc: round(totalTtc),
    };
  }

  // ─── Snapshot ─────────────────────────────────────────────────────────────

  /**
   * Build the JSONB payload that gets persisted on the Quotation row so
   * old PDFs stay correct even if the admin edits company info later.
   * Translations are resolved at snapshot time using the quote's chosen
   * language (with French fallback).
   */
  private buildCompanySnapshot(
    settings: CompanyBillingSettings,
    language: DevisLanguage,
    currency: string,
    tvaRate: number,
  ) {
    return {
      companyName: settings.companyName,
      companyLogoPath: settings.companyLogoPath ?? null,
      companyAddress: settings.companyAddress ?? null,
      companyCity: settings.companyCity ?? null,
      companyCountry: settings.companyCountry ?? null,
      companyPhone: settings.companyPhone ?? null,
      companyEmail: settings.companyEmail ?? null,
      taxRegistrationNumber: settings.taxRegistrationNumber ?? null,
      tvaRate,
      currency,
      selectedLanguage: language,
      legalText: pickTranslation(settings.legalTextTranslations, language),
      footerText: pickTranslation(settings.footerTextTranslations, language),
      // Carry the FULL translation maps so the PDF renderer can
      // re-resolve when the admin or doctor regenerates in a
      // different language without losing the historical snapshot.
      // Legacy snapshots without these fields stay valid — the
      // renderer falls back to the resolved `legalText`/`footerText`
      // strings above.
      legalTextTranslations:
        (settings.legalTextTranslations as Record<string, unknown> | null) ??
        null,
      footerTextTranslations:
        (settings.footerTextTranslations as Record<string, unknown> | null) ??
        null,
      bankDetails:
        (settings.bankDetails as Record<string, string> | null) ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clinic snapshot — the doctor's dentist profile at the moment the
   * Quote is sent. Used as the "Billed to" block on the PDF.
   */
  private buildClinicSnapshot(
    doctor: { id: string; fullName: string; email: string },
    profile: DentistProfile | null,
    patient: { fullName: string | null } | null = null,
  ) {
    return {
      doctorId: doctor.id,
      doctorFullName: doctor.fullName,
      doctorEmail: doctor.email,
      // Patient name is snapshotted alongside the clinic so the PDF
      // header has it without re-joining the live Patient row at
      // render time. Optional — legacy quotes pre-date this field and
      // the PDF renderer falls back to `—` when it's missing.
      patientFullName: patient?.fullName ?? null,
      clinicName: profile?.clinicName ?? null,
      clinicAddress: profile?.clinicAddress ?? null,
      city: profile?.city ?? null,
      country: profile?.country ?? null,
      clinicPhone: profile?.clinicPhone ?? null,
      clinicEmail: profile?.clinicEmail ?? null,
      // Doctor's "Matricule fiscal" — snapshotted so historical quotes
      // lock in the tax id that was on file at send time. The invoice
      // renderer reads this key first, then falls back to the live
      // profile.
      taxId: profile?.taxId ?? null,
      logoUrl: profile?.logoUrl ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /** Read by order id — admin, owning dentist, assigned designer. */
  async getForOrder(
    orderId: string,
    caller: Caller,
  ): Promise<Quotation | null> {
    await this.assertOrderReadable(orderId, caller);
    // Include the attached pack's LOCALIZED display fields (read-only) so
    // the order summary can render the pack name / expiration / finishing
    // in the current UI language for BOTH admin and doctor, without
    // storing translated labels on the quote. Price/identity stay driven
    // by the stable snapshot (packId, archType, totalPrice, currency).
    return this.prisma.quotation.findFirst({
      where: { orderId, deletedAt: null },
      include: {
        pack: {
          select: {
            id: true,
            name: true,
            nameI18n: true,
            descriptionI18n: true,
            treatmentExpirationLabel: true,
            finishingIncludedLabel: true,
            maxStepsPerArch: true,
            includedCorrections: true,
            isUnlimitedSteps: true,
            isUnlimitedCorrections: true,
          },
        },
      },
    });
  }

  /**
   * Read a quotation by its own id with the same RBAC as getForOrder:
   * caller must be able to read the parent order. Used by the
   * `/quotations/:id/...` endpoints that take a quote id directly.
   */
  async getForOrderByQuotationId(
    quotationId: string,
    caller: Caller,
  ): Promise<Quotation> {
    const quote = await this.loadQuotation(quotationId);
    await this.assertOrderReadable(quote.orderId, caller);
    return quote;
  }

  /**
   * Create a quote for an order. Admin-only.
   *
   * Fails if a non-canceled / non-rejected quote already exists — admin
   * must cancel the existing one first. (Multiple quotes per order is
   * out of scope; the unique constraint on orderId enforces it.)
   */
  async create(
    orderId: string,
    dto: CreateQuotationDto,
    caller: Caller,
  ): Promise<Quotation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can create a quotation.');
    }
    await this.assertOrderReadable(orderId, caller);

    const existing = await this.prisma.quotation.findUnique({
      where: { orderId },
    });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException(
        `Order already has a quotation (status: ${existing.status}). Cancel it first to create a new one.`,
      );
    }

    const settings = await this.settingsService.requireActive();
    const language = dto.language ?? DevisLanguage.fr;
    const currency = dto.currency ?? settings.defaultCurrency ?? 'TND';
    const tvaRate = dto.tvaRate ?? settings.defaultTvaRate ?? 19;

    // Treatment fee precedence (top → bottom):
    //   1. Admin-typed value on this quote (explicit override)
    //   2. CompanyBillingSettings.defaultTreatmentFee (the "policy")
    //   3. 0 (fallback for tenants who haven't configured a default yet)
    // Number() unwraps the Prisma Decimal so computeTotals stays Float-only.
    const defaultTreatmentFee = Number(settings.defaultTreatmentFee ?? 0);
    const treatmentFees = dto.treatmentFees ?? defaultTreatmentFee;

    const totals = QuotationService.computeTotals(
      treatmentFees,
      dto.fabricationFees ?? 0,
      dto.deliveryFees ?? 0,
      dto.discountAmount ?? 0,
      tvaRate,
    );

    return this.prisma.quotation.create({
      data: {
        orderId,
        language,
        status: QuotationStatus.draft,
        treatmentFees,
        fabricationFees: dto.fabricationFees ?? 0,
        deliveryFees: dto.deliveryFees ?? 0,
        discountAmount: dto.discountAmount ?? 0,
        tvaRate,
        currency,
        notes: dto.notes ?? null,
        adminMessage: dto.adminMessage ?? null,
        subTotalHt: totals.subTotalHt,
        tvaAmount: totals.tvaAmount,
        totalTtc: totals.totalTtc,
        createdById: caller.userId,
      },
    });
  }

  /**
   * Update an existing quote. Admin can edit while status is draft.
   * Once `sent / approved / rejected / canceled`, the quote becomes
   * immutable (super_admin can re-open via cancel + recreate).
   */
  async update(
    id: string,
    dto: UpdateQuotationDto,
    caller: Caller,
  ): Promise<Quotation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can edit a quotation.');
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (quote.status !== QuotationStatus.draft) {
      throw new BadRequestException(
        `Quotation cannot be edited while in "${quote.status}" status. Cancel it first.`,
      );
    }

    const tvaRate = dto.tvaRate ?? quote.tvaRate;
    const deliveryFees = dto.deliveryFees ?? quote.deliveryFees;
    const discountAmount = dto.discountAmount ?? quote.discountAmount;
    const totals = QuotationService.computeTotals(
      dto.treatmentFees ?? quote.treatmentFees,
      dto.fabricationFees ?? quote.fabricationFees,
      deliveryFees,
      discountAmount,
      tvaRate,
    );

    // Pack-based quotes need their Decimal `totalPrice` field kept in
    // sync with the new net, otherwise the payment-plan validator
    // (which compares Σinstallments against `totalPrice`) would still
    // be looking at the pre-discount pack price. We use the Decimal
    // arithmetic via `toFixed(3)` so we never round through Number.
    //
    // If a plan exists when the totals change, wipe it — the admin
    // has to reconfigure the installments to match the new total.
    // Cheaper than silently leaving an out-of-balance plan around.
    const isPackQuote = !!quote.packId;
    const newTotalDecimal = isPackQuote
      ? new Prisma.Decimal(totals.totalTtc.toFixed(3))
      : null;
    const totalChanged =
      isPackQuote &&
      newTotalDecimal !== null &&
      (!quote.totalPrice || !quote.totalPrice.equals(newTotalDecimal));

    return this.prisma.$transaction(async (tx) => {
      if (totalChanged) {
        // No payment has cleared yet (status === draft asserted above),
        // so this is safe — the SUCCESS transition can only happen on
        // installments that already exist after `approve()`.
        await tx.quoteStepBatch.deleteMany({ where: { quotationId: quote.id } });
        await tx.quoteInstallment.deleteMany({ where: { quotationId: quote.id } });
      }
      return tx.quotation.update({
        where: { id: quote.id },
        data: {
          language: dto.language ?? quote.language,
          treatmentFees: dto.treatmentFees ?? quote.treatmentFees,
          fabricationFees: dto.fabricationFees ?? quote.fabricationFees,
          deliveryFees,
          discountAmount,
          tvaRate,
          currency: dto.currency ?? quote.currency,
          notes: dto.notes ?? quote.notes,
          adminMessage: dto.adminMessage ?? quote.adminMessage,
          subTotalHt: totals.subTotalHt,
          tvaAmount: totals.tvaAmount,
          totalTtc: totals.totalTtc,
          ...(isPackQuote && newTotalDecimal
            ? {
                totalPrice: newTotalDecimal,
                remainingAmount: newTotalDecimal,
              }
            : {}),
        },
      });
    });
  }

  /**
   * Ensure the quote has a number + snapshots, generating them if
   * needed. Called by both `send()` and the PDF generator so either
   * entry point produces a complete record.
   */
  async ensureSnapshotAndNumber(quote: Quotation): Promise<Quotation> {
    if (
      quote.quotationNumber &&
      quote.companySnapshot &&
      quote.clinicSnapshot
    ) {
      return quote;
    }

    const settings = await this.settingsService.requireActive();
    const order = await this.prisma.dentalOrder.findUniqueOrThrow({
      where: { id: quote.orderId },
      include: {
        doctor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            dentistProfile: true,
          },
        },
        // Patient is needed both for the snapshot (PDF "billed to"
        // section) and for the new `dv_<patient>_<date>` number
        // format. Single join, both consumers happy.
        patient: { select: { fullName: true } },
      },
    });

    const companySnapshot = this.buildCompanySnapshot(
      settings,
      quote.language,
      quote.currency,
      quote.tvaRate,
    );
    const clinicSnapshot = this.buildClinicSnapshot(
      {
        id: order.doctor.id,
        fullName: order.doctor.fullName,
        email: order.doctor.email,
      },
      order.doctor.dentistProfile ?? null,
      order.patient,
    );

    const quotationNumber =
      quote.quotationNumber ??
      (await this.settingsService.allocateQuotationNumber({
        patientFullName: order.patient?.fullName ?? null,
        createdAt: quote.createdAt,
      }));

    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: {
        quotationNumber,
        companySnapshot: companySnapshot as unknown as Prisma.InputJsonValue,
        clinicSnapshot: clinicSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Send the quote to the doctor. Transitions:
   *   quotation.status: draft → sent
   *   order.status: → quotation_sent
   * Locks in quotationNumber + companySnapshot + clinicSnapshot.
   */
  async send(id: string, caller: Caller): Promise<Quotation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can send a quotation.');
    }
    let quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (quote.status !== QuotationStatus.draft) {
      throw new BadRequestException(
        `Quotation cannot be sent from "${quote.status}" status.`,
      );
    }

    // Pack-based quotes MUST have a configured payment plan before
    // they go out. Otherwise the doctor receives the quote, hits
    // Approve, and gets a 400 from tryApprovePackQuote() saying the
    // plan is missing — a dead-end since only an admin can fix it.
    // This guard catches the bad state at the admin layer where it
    // CAN be acted on (admin opens the plan builder, configures it,
    // hits Send again).
    if (quote.packId) {
      const planRowCount = await this.prisma.quoteInstallment.count({
        where: { quotationId: quote.id },
      });
      if (planRowCount === 0) {
        throw new BadRequestException(
          'Configure the payment plan (installments + step ranges) before sending this pack-based quote. The doctor will not be able to approve it otherwise.',
        );
      }
    }

    quote = await this.ensureSnapshotAndNumber(quote);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.sent,
          sentAt: new Date(),
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.quotation_sent },
      });
      return u;
    });
    // Doctor e-mail is sent by the notification listener on QuotationSent.
    // Bell ping for the doctor — the email goes too, this is just the
    // in-app version that backs the badge in the header. Joins
    // doctor + patient so the notification body has the full
    // "Quotation Q-… for patient X (ORD-…)" context.
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: updated.orderId },
      select: {
        doctorId: true,
        orderCode: true,
        doctor: { select: { fullName: true } },
        patient: { select: { fullName: true } },
      },
    });
    if (order) {
      this.events.emit(NotificationEvents.QuotationSent, {
        quotationId: updated.id,
        orderId: updated.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: updated.language ?? null,
        quotationNumber: updated.quotationNumber ?? null,
      });
    }
    return updated;
  }

  /**
   * Doctor (or admin) approves the Quote.
   *
   * Two flavours of approval:
   *   • **Legacy quote** (no pack attached): quotation.status → approved,
   *     order.status → fabrication. Single path that's existed since
   *     day one.
   *   • **Pack-based quote** (`packId` set): delegated to
   *     QuotationPaymentPlanService.tryApprovePackQuote(). That path
   *     requires a configured payment plan and moves the order to
   *     `payment_plan_selected` instead of fabrication.
   *
   * The branch is decided by the quote row itself — callers don't pick
   * a flow, so we can't accidentally send a pack quote down the legacy
   * fabrication path (which would skip payment entirely).
   */
  async approve(id: string, caller: Caller): Promise<Quotation> {
    const quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    const isOwnerDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwnerDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can approve the quotation.',
      );
    }
    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only a "sent" quotation can be approved (current: ${quote.status}).`,
      );
    }

    // Pack-based quote → defer to the payment-plan service. Returns
    // `true` when it took ownership, in which case we re-load + notify
    // and return. `false` means it's a legacy quote and we fall through
    // to the existing fabrication path.
    const handledByPack = await this.paymentPlan.tryApprovePackQuote(
      quote,
      caller,
    );
    if (handledByPack) {
      const fresh = await this.loadQuotation(id);
      this.emitQuoteDecision(fresh, 'approved');
      return fresh;
    }

    const approved = await this.transitionSentToApproved(
      quote,
      caller.userId,
      OrderStatus.fabrication,
    );
    if (!approved) {
      throw new BadRequestException(
        'This quotation was already decided by another request.',
      );
    }
    // Admin e-mail via the notification listener (QuotationApproved).
    this.emitQuoteDecision(approved, 'approved');
    return approved;
  }

  /**
   * Implicit approval: the doctor's FIRST payment on a `sent` quote IS
   * the approval (the doctor's quote view no longer has an Approve
   * button — clicking Pay is the acceptance). PaymentsService calls this
   * before creating the Payment row so there is exactly ONE owner of the
   * "sent -> approved" mutation instead of a second copy living in the
   * payments module.
   *
   * Idempotent: a quote that is not `sent` (already approved on a prior
   * installment) is left untouched and `false` is returned. The order
   * moves to `payment_pending` — "doctor accepted, money not yet in" —
   * and the payment settlement that follows advances it further
   * (`payment_review` / `fabrication`). Previously this path jumped the
   * order straight to `fabrication`, which stuck if the card gateway
   * then failed.
   *
   * No decision e-mail is emitted here on purpose: the payment
   * notification that follows already tells the admin the doctor acted.
   */
  async approveOnFirstPayment(
    quotationId: string,
    caller: Caller,
  ): Promise<boolean> {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, orderId: true, status: true },
    });
    if (!quote || quote.status !== QuotationStatus.sent) return false;
    const approved = await this.transitionSentToApproved(
      quote,
      caller.userId,
      OrderStatus.payment_pending,
    );
    return approved !== null;
  }

  /**
   * THE "sent -> approved" mutation. Guarded on `status = sent` inside the
   * transaction so two concurrent approvals (explicit + first payment,
   * or two payments) cannot both "win": the second sees 0 rows and gets
   * `null`. Both the explicit approve endpoint and the implicit
   * first-payment path go through here.
   */
  private async transitionSentToApproved(
    quote: { id: string; orderId: string },
    approvedById: string,
    nextOrderStatus: OrderStatus,
  ): Promise<Quotation | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.quotation.updateMany({
        where: { id: quote.id, status: QuotationStatus.sent },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById,
        },
      });
      if (changed.count === 0) return null;
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: nextOrderStatus },
      });
      return tx.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    });
  }

  /**
   * Doctor (or admin) rejects the Quote.
   *   quotation.status → rejected
   *   order.status → canceled
   */
  async reject(
    id: string,
    rejectionReason: string | undefined,
    caller: Caller,
  ): Promise<Quotation> {
    const quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    const isOwnerDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwnerDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can reject the quotation.',
      );
    }
    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only a "sent" quotation can be rejected (current: ${quote.status}).`,
      );
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.rejected,
          rejectedAt: new Date(),
          rejectedById: caller.userId,
          rejectionReason: rejectionReason ?? null,
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.canceled },
      });
      return u;
    });
    // Admin e-mail via the notification listener (QuotationRejected).
    this.emitQuoteDecision(rejected, 'rejected', rejectionReason);
    return rejected;
  }

  /**
   * Pull a sent quote back to draft so admin can correct it (wrong
   * pack, wrong fees, typo in the admin message, wrong language at
   * send time — anything). The doctor is notified so they don't act
   * on the stale copy.
   *
   * Lifecycle effect:
   *   • quote.status: sent → draft (sentAt cleared)
   *   • order.status: quotation_sent → treatment_approved (the
   *     canonical state right before the quote was issued)
   *
   * Refused on:
   *   • draft (no-op — already editable; would be confusing)
   *   • approved / rejected / canceled (terminal; if the quote was
   *     wrong AND a doctor already approved, that's a refund flow —
   *     not this method)
   *
   * Authorisation: admin only. The doctor side has the explicit
   * reject path with a reason — this is for the team's own
   * "we made a mistake, hold on" correction loop.
   */
  async revertToDraft(id: string, caller: Caller): Promise<Quotation> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can recall a sent quotation for correction.',
      );
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only "sent" quotations can be recalled to draft (current: ${quote.status}).`,
      );
    }

    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: quote.orderId },
      select: {
        doctorId: true,
        orderCode: true,
        doctor: { select: { fullName: true } },
        patient: { select: { fullName: true } },
      },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.draft,
          sentAt: null,
        },
      });
      // Snap the order back to the pre-send state. We do NOT touch
      // installments / batches because they're only created when the
      // doctor approves a pack quote (i.e. post-sent path); a sent
      // quote that hasn't been approved has no plan rows to worry
      // about. Belt-and-braces: even if it did, those wouldn't
      // become payable until the quote re-enters approved state.
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.treatment_approved },
      });
      return u;
    });

    if (order) {
      this.events.emit(NotificationEvents.QuotationRecalled, {
        quotationId: updated.id,
        orderId: updated.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: updated.language ?? null,
        quotationNumber: updated.quotationNumber ?? null,
      });
    }

    return updated;
  }

  /**
   * Re-render the quote PDF in any supported language without rolling
   * back the lifecycle. Admin OR the owning dentist can call this —
   * picking the document language is presentation, not a business
   * edit, so it's safe even on already-sent / approved / rejected
   * quotes (the company snapshot stores the translation maps so we
   * can re-resolve labels without losing the historical context).
   *
   * Behaviour:
   *   • `lang` provided + different from current → updates
   *     `quote.language` (a fresh PDF in that language will be
   *     rendered by the caller).
   *   • `lang` omitted → idempotent. Just ensures the quote has a
   *     number + snapshot so the caller's render call has everything
   *     it needs.
   *
   * Authorisation: admins always pass; dentists must be the order's
   * doctor; designers can't trigger a re-render (read-only on
   * quotes). RBAC is reused from `assertOrderReadable` to stay
   * consistent with the rest of the service.
   */
  async regeneratePdfInLanguage(
    id: string,
    lang: DevisLanguage | undefined,
    caller: Caller,
  ): Promise<Quotation> {
    let quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    // Designers can read the quote but they don't pick the document
    // language — that's a doctor / admin call. Block them here so the
    // file on disk doesn't change under their fingertips.
    const isOwningDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwningDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can change the document language.',
      );
    }

    // Make sure the row has a number + snapshots before we ever try to
    // render. This is also where legacy quotes pre-dating the
    // translation-maps field get their snapshot enriched.
    quote = await this.ensureSnapshotAndNumber(quote);

    // No language switch requested → just hand the quote back. The
    // caller renders with whatever language is already on the row.
    if (!lang || lang === quote.language) {
      return quote;
    }

    // Update language only. We intentionally do NOT touch the
    // companySnapshot — its translation maps already let the renderer
    // pick the right legalText/footerText for the new language. This
    // keeps the historical snapshot honest (the original send-time
    // company state stays preserved).
    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: { language: lang },
    });
  }

  /**
   * Cancel a draft/sent quotation (admin). Used to "re-issue" — admin
   * iterated, decided the fees were wrong, wants to start over.
   *
   * Because the table has `orderId @unique`, we MUST physically delete
   * the row to free the slot. Approved / rejected quotes are NOT
   * cancelable from this path (they're terminal) so we never lose
   * audit-worthy records this way:
   *   • approved → terminal happy path, keep row
   *   • rejected → order is canceled too, keep row
   *   • canceled by admin → fresh attempt, drop row
   */
  async cancel(
    id: string,
    caller: Caller,
  ): Promise<{ id: string; canceled: true }> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can cancel a quotation.');
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (
      quote.status === QuotationStatus.approved ||
      quote.status === QuotationStatus.rejected ||
      quote.status === QuotationStatus.canceled
    ) {
      throw new BadRequestException(
        `Quotation already in terminal state "${quote.status}".`,
      );
    }

    // Pull the doctorId before we delete the quote — once the row is
    // gone we can't re-derive the recipient. Only notify when the
    // quote had actually been sent (admin canceling a draft is
    // invisible to the doctor). We also pull doctor + patient names +
    // orderCode here so the bell body can read as "Quotation Q-… for
    // patient X (ORD-…) was canceled."
    const wasSent = quote.status === QuotationStatus.sent;
    const order = wasSent
      ? await this.prisma.dentalOrder.findUnique({
          where: { id: quote.orderId },
          select: {
            doctorId: true,
            orderCode: true,
            doctor: { select: { fullName: true } },
            patient: { select: { fullName: true } },
          },
        })
      : null;

    await this.prisma.quotation.delete({ where: { id: quote.id } });

    if (wasSent && order) {
      this.events.emit(NotificationEvents.QuotationCanceled, {
        quotationId: quote.id,
        orderId: quote.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: quote.language ?? null,
        quotationNumber: quote.quotationNumber ?? null,
      });
    }

    return { id: quote.id, canceled: true };
  }

  /**
   * Admin browses all quotations with filters.
   */
  async listAdmin(filter: QuotationFilterDto, caller: Caller) {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can list all quotations.');
    }
    const page = filter.page ?? 1;
    const take = filter.limit ?? 20;
    const skip = (page - 1) * take;

    const where: Prisma.QuotationWhereInput = {
      deletedAt: null,
    };
    if (filter.status) where.status = filter.status;
    if (filter.language) where.language = filter.language;
    if (filter.doctorId) {
      where.order = { ...(where.order as object), doctorId: filter.doctorId };
    }
    if (filter.orderCode) {
      where.order = {
        ...(where.order as object),
        orderCode: { contains: filter.orderCode, mode: 'insensitive' },
      };
    }
    if (filter.createdFrom || filter.createdTo) {
      where.createdAt = {};
      if (filter.createdFrom)
        where.createdAt.gte = new Date(filter.createdFrom);
      if (filter.createdTo) where.createdAt.lte = new Date(filter.createdTo);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          order: {
            select: {
              id: true,
              orderCode: true,
              doctorId: true,
              doctor: { select: { fullName: true, email: true } },
            },
          },
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      data: rows,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }
}
