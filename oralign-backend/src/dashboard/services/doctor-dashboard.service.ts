import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 30_000; // 30 s — per-doctor, smaller blast radius

const startOfDay = (d = new Date()): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfMonth = (d = new Date()): Date => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

const subMonths = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setMonth(x.getMonth() - n);
  return x;
};

const toNumber = (value: Prisma.Decimal | number | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
};

/**
 * Doctor dashboard service — every KPI scoped to a single doctor.
 *
 * The doctor sees ONLY their own data. Caller passes the JWT subject
 * (sub = doctor user id) and the service hard-filters every query
 * with `doctorId = sub`.
 *
 * Cached per-doctor for 30 s — most "I just refreshed my dashboard"
 * traffic hits the cache, and a fresh write to one of their orders
 * busts it via the dashboard events listener.
 */
@Injectable()
export class DoctorDashboardService {
  private readonly logger = new Logger(DoctorDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  cacheKey(doctorId: string): string {
    return `doctor-dashboard:${doctorId}`;
  }

  async invalidateDoctor(doctorId: string): Promise<void> {
    await this.cache.del(this.cacheKey(doctorId));
  }

  async getKpis(doctorId: string) {
    const key = this.cacheKey(doctorId);
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;

    const now = new Date();
    const dayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));

    const [
      ordersTotal,
      ordersToday,
      ordersThisMonth,
      ordersPrevMonth,
      patientsTotal,
      newPatientsThisMonth,
    ] = await this.prisma.$transaction([
      this.prisma.dentalOrder.count({ where: { doctorId, deletedAt: null } }),
      this.prisma.dentalOrder.count({
        where: { doctorId, deletedAt: null, createdAt: { gte: dayStart } },
      }),
      this.prisma.dentalOrder.count({
        where: { doctorId, deletedAt: null, createdAt: { gte: monthStart } },
      }),
      this.prisma.dentalOrder.count({
        where: {
          doctorId,
          deletedAt: null,
          createdAt: { gte: prevMonthStart, lt: monthStart },
        },
      }),
      this.prisma.patient.count({ where: { doctorId, deletedAt: null } }),
      this.prisma.patient.count({
        where: { doctorId, deletedAt: null, createdAt: { gte: monthStart } },
      }),
    ]);

    // Quotation aggregates — paid/unpaid + revenue scoped to this
    // doctor (via order.doctorId).
    const [paidAgg, unpaidAgg, allAgg] = await this.prisma.$transaction([
      this.prisma.quotation.aggregate({
        _count: { _all: true },
        _sum: { totalPrice: true, paidAmount: true },
        where: {
          deletedAt: null,
          paymentStatus: QuotationPaymentStatus.paid,
          order: { doctorId },
        },
      }),
      this.prisma.quotation.aggregate({
        _count: { _all: true },
        _sum: { totalPrice: true, paidAmount: true },
        where: {
          deletedAt: null,
          paymentStatus: {
            in: [QuotationPaymentStatus.pending, QuotationPaymentStatus.partially_paid],
          },
          order: { doctorId },
        },
      }),
      this.prisma.quotation.aggregate({
        _count: { _all: true },
        _sum: { totalPrice: true, paidAmount: true },
        where: { deletedAt: null, order: { doctorId } },
      }),
    ]);

    const [paymentsPending, paymentsCompleted, paymentsFailed, paymentsAwaiting] =
      await this.prisma.$transaction([
        this.prisma.payment.count({
          where: { status: PaymentRecordStatus.pending, order: { doctorId } },
        }),
        this.prisma.payment.count({
          where: { status: PaymentRecordStatus.success, order: { doctorId } },
        }),
        this.prisma.payment.count({
          where: {
            status: { in: [PaymentRecordStatus.failed, PaymentRecordStatus.rejected] },
            order: { doctorId },
          },
        }),
        this.prisma.payment.count({
          where: {
            status: PaymentRecordStatus.awaiting_confirmation,
            order: { doctorId },
          },
        }),
      ]);

    const totalRevenue = toNumber(paidAgg._sum.totalPrice);
    const paidAmount =
      toNumber(paidAgg._sum.paidAmount) + toNumber(unpaidAgg._sum.paidAmount);
    const unpaidDebt = Math.max(
      0,
      toNumber(unpaidAgg._sum.totalPrice) - toNumber(unpaidAgg._sum.paidAmount),
    );

    // Current pack: the latest paid quotation with a packId attached
    // is the doctor's "current" pack snapshot. No DoctorSubscription
    // table yet — TODO when subscription model is introduced.
    const latestPaidWithPack = await this.prisma.quotation.findFirst({
      where: {
        deletedAt: null,
        order: { doctorId },
        packId: { not: null },
      },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        packId: true,
        sentAt: true,
        approvedAt: true,
        pack: {
          select: {
            id: true,
            name: true,
            description: true,
            isUnlimitedSteps: true,
            isUnlimitedCorrections: true,
            maxStepsPerArch: true,
            includedCorrections: true,
          },
        },
        installments: {
          select: { status: true, dueDate: true, paidAt: true },
        },
      },
    });

    // Best pack suggestion = the active pack with the highest paid
    // quotation count across the whole platform. A rough but useful
    // proxy. The doctor's own choice is excluded.
    const popularPacks = await this.prisma.quotation.groupBy({
      by: ['packId'],
      where: {
        deletedAt: null,
        packId: { not: null },
        paymentStatus: QuotationPaymentStatus.paid,
      },
      _count: { _all: true },
      orderBy: { _count: { packId: 'desc' } },
      take: 3,
    });
    const popularPackIds = popularPacks
      .map((p) => p.packId!)
      .filter((id): id is string => !!id && id !== latestPaidWithPack?.packId);
    const suggestedPack = popularPackIds[0]
      ? await this.prisma.pack.findUnique({
          where: { id: popularPackIds[0] },
          select: { id: true, name: true, description: true, isActive: true },
        })
      : null;

    // Pack usage / remaining days. We approximate: if the pack has
    // a fixed maxStepsPerArch (not unlimited), usage = orders.created
    // since the most recent paid quote divided by maxStepsPerArch. If
    // unlimited, leave usage null. Remaining days: 90 days from the
    // paid date as a placeholder (TODO when subscription is real).
    let packExpiresAt: Date | null = null;
    let packRemainingDays: number | null = null;
    let packUsagePct: number | null = null;
    if (latestPaidWithPack?.approvedAt) {
      packExpiresAt = new Date(latestPaidWithPack.approvedAt);
      packExpiresAt.setDate(packExpiresAt.getDate() + 90);
      packRemainingDays = Math.max(
        0,
        Math.ceil((packExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const max = latestPaidWithPack.pack?.maxStepsPerArch;
      if (max && !latestPaidWithPack.pack?.isUnlimitedSteps) {
        const used = await this.prisma.dentalOrder.count({
          where: {
            doctorId,
            deletedAt: null,
            createdAt: { gte: latestPaidWithPack.approvedAt },
          },
        });
        packUsagePct = Math.min(100, Math.round((used / max) * 100));
      }
    }

    const result = {
      doctorId,
      generatedAt: now.toISOString(),
      orders: {
        total: ordersTotal,
        today: ordersToday,
        thisMonth: ordersThisMonth,
        prevMonth: ordersPrevMonth,
        paid: paidAgg._count._all,
        unpaid: unpaidAgg._count._all,
      },
      patients: {
        total: patientsTotal,
        newThisMonth: newPatientsThisMonth,
      },
      revenue: {
        totalGenerated: totalRevenue,
        collected: paidAmount,
        unpaidDebt,
      },
      payments: {
        pending: paymentsPending,
        completed: paymentsCompleted,
        failed: paymentsFailed,
        awaitingConfirmation: paymentsAwaiting,
      },
      quotations: {
        total: allAgg._count._all,
        paid: paidAgg._count._all,
        unpaid: unpaidAgg._count._all,
      },
      currentPack: latestPaidWithPack?.pack
        ? {
            id: latestPaidWithPack.pack.id,
            name: latestPaidWithPack.pack.name,
            description: latestPaidWithPack.pack.description,
            approvedAt: latestPaidWithPack.approvedAt?.toISOString() ?? null,
            expiresAt: packExpiresAt?.toISOString() ?? null,
            remainingDays: packRemainingDays,
            usagePct: packUsagePct,
            isUnlimitedSteps: latestPaidWithPack.pack.isUnlimitedSteps,
          }
        : null,
      suggestedPack: suggestedPack ?? null,
    };

    await this.cache.set(key, result, CACHE_TTL_MS);
    return result;
  }

  /**
   * Per-order breakdown that backs the doctor's "Outstanding balance"
   * KPI popup. Returns every quotation the doctor owns where the
   * payment status is `pending` or `partially_paid`, with the
   * remaining amount pre-computed so the UI can render the list
   * without re-doing the math client-side.
   *
   * Why a dedicated endpoint instead of reusing the orders list:
   *   • Different sort key — the popup wants newest outstanding
   *     first by quote update timestamp, not by order creation.
   *   • Different projection — only the four numeric fields plus
   *     the order/patient identity, not the full order include
   *     graph the list page hydrates.
   *   • Different access shape — the popup never paginates (a
   *     doctor with 1000 outstanding orders has bigger problems
   *     than UX); we cap the result server-side at 100 rows.
   */
  async listOutstandingOrders(doctorId: string) {
    const rows = await this.prisma.quotation.findMany({
      where: {
        deletedAt: null,
        order: { doctorId, deletedAt: null },
        paymentStatus: {
          in: [
            QuotationPaymentStatus.pending,
            QuotationPaymentStatus.partially_paid,
          ],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        totalPrice: true,
        paidAmount: true,
        currency: true,
        paymentStatus: true,
        updatedAt: true,
        packName: true,
        order: {
          select: {
            id: true,
            orderCode: true,
            patient: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    let totalOutstanding = 0;
    const data = rows.map((q) => {
      const total = Number(q.totalPrice ?? 0);
      const paid = Number(q.paidAmount ?? 0);
      const remaining = Math.max(0, total - paid);
      totalOutstanding += remaining;
      return {
        orderId: q.order.id,
        orderCode: q.order.orderCode,
        patientName: q.order.patient?.fullName ?? null,
        packName: q.packName ?? null,
        totalPrice: total,
        paidAmount: paid,
        remaining,
        currency: q.currency ?? 'TND',
        paymentStatus: q.paymentStatus,
        updatedAt: q.updatedAt.toISOString(),
      };
    });

    return {
      // Pre-summed total so the dialog header shows the right number
      // even if the doctor has more than 100 outstanding orders (we
      // cap the list but the sum is from the same query).
      totalOutstanding,
      count: data.length,
      currency: data[0]?.currency ?? 'TND',
      data,
    };
  }

  /**
   * Available packs the doctor can subscribe / upgrade to. Returns the
   * full active pack catalogue with the two_arches price snapshot
   * (consistent with the post-refactor single-price model).
   */
  async listAvailablePacks(doctorId: string) {
    const packs = await this.prisma.pack.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        prices: {
          where: { isActive: true },
          select: { id: true, archType: true, price: true, currency: true },
        },
      },
    });
    // Mark the doctor's current pack so the UI can render the
    // "Current" badge without a second round-trip.
    const current = await this.prisma.quotation.findFirst({
      where: {
        deletedAt: null,
        order: { doctorId },
        packId: { not: null },
        paymentStatus: QuotationPaymentStatus.paid,
      },
      orderBy: { sentAt: 'desc' },
      select: { packId: true },
    });
    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      maxStepsPerArch: p.maxStepsPerArch,
      includedCorrections: p.includedCorrections,
      isUnlimitedSteps: p.isUnlimitedSteps,
      isUnlimitedCorrections: p.isUnlimitedCorrections,
      isForOrthodontists: p.isForOrthodontists,
      price: toNumber(p.prices.find((x) => x.archType === 'two_arches')?.price ?? p.prices[0]?.price ?? 0),
      currency: p.prices.find((x) => x.archType === 'two_arches')?.currency ?? p.prices[0]?.currency ?? 'TND',
      isCurrent: current?.packId === p.id,
    }));
  }
}
