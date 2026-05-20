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
import { OrderNotificationService } from '../../mail/order-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateQuotationDto,
  QuotationFilterDto,
  UpdateQuotationDto,
} from '../dto/quotation.dto';
import { CompanyBillingSettingsService } from './company-billing-settings.service';
import { pickTranslation } from './quotation-i18n';

type Caller = { userId: string; role: UserRole };

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

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
    private readonly settingsService: CompanyBillingSettingsService,
    private readonly notifications: OrderNotificationService,
  ) {}

  // ─── Authorisation helpers ────────────────────────────────────────────────

  private isAdmin(caller: Caller): boolean {
    return ADMIN_ROLES.includes(caller.role);
  }

  /**
   * Returns the order if the caller can READ it (admin, owning dentist,
   * or assigned designer). Throws otherwise.
   */
  private async assertOrderReadable(orderId: string, caller: Caller) {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        doctorId: true,
        assignedDesignerId: true,
        status: true,
        deletedAt: true,
        orderCode: true,
      },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found.');
    }
    if (this.isAdmin(caller)) return order;
    if (caller.role === UserRole.dentist && order.doctorId === caller.userId) {
      return order;
    }
    if (
      caller.role === UserRole.designer &&
      order.assignedDesignerId === caller.userId
    ) {
      return order;
    }
    throw new ForbiddenException('You cannot access this order.');
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
  ) {
    return {
      doctorId: doctor.id,
      doctorFullName: doctor.fullName,
      doctorEmail: doctor.email,
      clinicName: profile?.clinicName ?? null,
      clinicAddress: profile?.clinicAddress ?? null,
      city: profile?.city ?? null,
      country: profile?.country ?? null,
      clinicPhone: profile?.clinicPhone ?? null,
      clinicEmail: profile?.clinicEmail ?? null,
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
    return this.prisma.quotation.findFirst({
      where: { orderId, deletedAt: null },
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
    if (!this.isAdmin(caller)) {
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

    const totals = QuotationService.computeTotals(
      dto.treatmentFees ?? 0,
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
        treatmentFees: dto.treatmentFees ?? 0,
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
    if (!this.isAdmin(caller)) {
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
    const totals = QuotationService.computeTotals(
      dto.treatmentFees ?? quote.treatmentFees,
      dto.fabricationFees ?? quote.fabricationFees,
      dto.deliveryFees ?? quote.deliveryFees,
      dto.discountAmount ?? quote.discountAmount,
      tvaRate,
    );

    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: {
        language: dto.language ?? quote.language,
        treatmentFees: dto.treatmentFees ?? quote.treatmentFees,
        fabricationFees: dto.fabricationFees ?? quote.fabricationFees,
        deliveryFees: dto.deliveryFees ?? quote.deliveryFees,
        discountAmount: dto.discountAmount ?? quote.discountAmount,
        tvaRate,
        currency: dto.currency ?? quote.currency,
        notes: dto.notes ?? quote.notes,
        adminMessage: dto.adminMessage ?? quote.adminMessage,
        subTotalHt: totals.subTotalHt,
        tvaAmount: totals.tvaAmount,
        totalTtc: totals.totalTtc,
      },
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
    );

    const quotationNumber =
      quote.quotationNumber ??
      (await this.settingsService.allocateNextQuotationNumber());

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
    if (!this.isAdmin(caller)) {
      throw new ForbiddenException('Only admins can send a quotation.');
    }
    let quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (quote.status !== QuotationStatus.draft) {
      throw new BadRequestException(
        `Quotation cannot be sent from "${quote.status}" status.`,
      );
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
    // Email the doctor: their quotation is ready for review.
    void this.notifications.notifyQuoteSent(updated.id);
    return updated;
  }

  /**
   * Doctor (or admin) approves the Quote.
   *   quotation.status → approved
   *   order.status → fabrication
   */
  async approve(id: string, caller: Caller): Promise<Quotation> {
    const quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    const isOwnerDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!this.isAdmin(caller) && !isOwnerDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can approve the quotation.',
      );
    }
    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only a "sent" quotation can be approved (current: ${quote.status}).`,
      );
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById: caller.userId,
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.fabrication },
      });
      return u;
    });
    // Email all admins: doctor approved the quotation.
    void this.notifications.notifyQuoteDecision(approved.id, 'approved');
    return approved;
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
    if (!this.isAdmin(caller) && !isOwnerDoctor) {
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
    // Email all admins: doctor rejected the quotation.
    void this.notifications.notifyQuoteDecision(
      rejected.id,
      'rejected',
      rejectionReason,
    );
    return rejected;
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
    if (!this.isAdmin(caller)) {
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

    await this.prisma.quotation.delete({ where: { id: quote.id } });
    return { id: quote.id, canceled: true };
  }

  /**
   * Admin browses all quotations with filters.
   */
  async listAdmin(filter: QuotationFilterDto, caller: Caller) {
    if (!this.isAdmin(caller)) {
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
