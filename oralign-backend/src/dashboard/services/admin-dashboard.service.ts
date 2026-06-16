import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  OrderStatus,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardRangeDto, AdminAnalyticsLimitDto } from '../dto/dashboard.dto';

const CACHE_TTL_MS = 60_000; // 60 s — KPIs are heavy reads; this is the right amortisation

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

const subDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
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
 * Admin dashboard service — every KPI + analytics block the admin
 * landing page renders.
 *
 * Reads are heavy — counts + sums + groupBy on Order/Payment/Quotation —
 * so the whole rollup is cached in Redis with a (rangeFrom, rangeTo)
 * key. The DashboardEventsListener invalidates the cache when one of
 * the watched domain events fires.
 */
@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private readonly knownCacheKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Lightweight attention counts for the admin sidebar badges. Kept
   * deliberately separate from the heavy `getKpis` rollup so the sidebar
   * (rendered on every dashboard page) pays only two cheap COUNTs and is
   * polled cheaply — never the full Redis-cached KPI aggregate.
   *
   *   • newOrders        — orders a doctor has SUBMITTED and the admin has
   *                        not yet started triaging (status = submitted).
   *   • pendingApprovals — dentists who signed up and are awaiting admin
   *                        approval (verificationStatus = pending).
   */
  async getSidebarBadges(): Promise<{
    newOrders: number;
    pendingApprovals: number;
  }> {
    const [newOrders, pendingApprovals] = await this.prisma.$transaction([
      this.prisma.dentalOrder.count({
        where: { deletedAt: null, status: OrderStatus.submitted },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.dentist,
          deletedAt: null,
          verificationStatus: VerificationStatus.pending,
        },
      }),
    ]);
    return { newOrders, pendingApprovals };
  }

  /**
   * Materialise the date range. When no range was supplied, default to
   * the last 30 days so the dashboard always has something to render.
   */
  private resolveRange(range?: DashboardRangeDto): { from: Date; to: Date } {
    const now = new Date();
    const to = range?.to ?? now;
    const from = range?.from ?? subDays(to, 30);
    return { from, to };
  }

  private cacheKey(prefix: string, range: { from: Date; to: Date }): string {
    return `admin-dashboard:${prefix}:${range.from.toISOString()}:${range.to.toISOString()}`;
  }

  // ─── Top-level KPI rollup ──────────────────────────────────────────

  async getKpis(rangeIn?: DashboardRangeDto) {
    const range = this.resolveRange(rangeIn);
    const key = this.cacheKey('kpis', range);
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;

    const now = new Date();
    const dayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));

    // Counters that the admin needs no matter the range.
    const [
      totalDoctors,
      activeDoctors,
      inactiveDoctors,
      newDoctorsInRange,
      totalPatients,
      newPatientsInRange,
      activePacks,
      totalOrders,
      ordersInRange,
      ordersToday,
      ordersThisMonth,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: UserRole.dentist, deletedAt: null },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.dentist,
          deletedAt: null,
          isActive: true,
          verificationStatus: VerificationStatus.approved,
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.dentist,
          deletedAt: null,
          OR: [{ isActive: false }, { verificationStatus: { not: VerificationStatus.approved } }],
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.dentist,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.patient.count({ where: { deletedAt: null } }),
      this.prisma.patient.count({
        where: {
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.pack.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.dentalOrder.count({ where: { deletedAt: null } }),
      this.prisma.dentalOrder.count({
        where: {
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.dentalOrder.count({
        where: { deletedAt: null, createdAt: { gte: dayStart } },
      }),
      this.prisma.dentalOrder.count({
        where: { deletedAt: null, createdAt: { gte: monthStart } },
      }),
    ]);

    // Paid vs unpaid (by quotation status — the cleanest signal).
    //
    // QUALIFYING-QUOTE rule:
    //
    //   • deletedAt: null         — quote is live
    //   • packId: { not: null }   — admin has finalised the price
    //   • status: approved        — DOCTOR has committed to the quote
    //
    // The status guard is critical: `paymentStatus: pending` on a
    // draft/sent quote does NOT mean there's an outstanding debt —
    // that's just the default. The debt only exists once the doctor
    // has approved the quote. Applied to every aggregate so monthly
    // growth / today's revenue stay consistent with the headline
    // totals and never double-count proposals as debt.
    const QUALIFYING_QUOTE = {
      deletedAt: null,
      packId: { not: null },
      status: QuotationStatus.approved,
    } as const;
    const [paidQuoteAgg, unpaidQuoteAgg, allQuoteAgg, monthQuoteAgg, prevMonthQuoteAgg, todayQuoteAgg] =
      await this.prisma.$transaction([
        this.prisma.quotation.aggregate({
          _count: { _all: true },
          _sum: { totalPrice: true, paidAmount: true },
          where: {
            ...QUALIFYING_QUOTE,
            paymentStatus: QuotationPaymentStatus.paid,
            sentAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.quotation.aggregate({
          _count: { _all: true },
          _sum: { totalPrice: true, paidAmount: true },
          where: {
            ...QUALIFYING_QUOTE,
            paymentStatus: {
              in: [
                QuotationPaymentStatus.pending,
                QuotationPaymentStatus.partially_paid,
              ],
            },
            sentAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.quotation.aggregate({
          _count: { _all: true },
          _sum: { totalPrice: true, paidAmount: true },
          where: { ...QUALIFYING_QUOTE, sentAt: { gte: range.from, lte: range.to } },
        }),
        this.prisma.quotation.aggregate({
          _sum: { paidAmount: true },
          where: { ...QUALIFYING_QUOTE, sentAt: { gte: monthStart } },
        }),
        this.prisma.quotation.aggregate({
          _sum: { paidAmount: true },
          where: {
            ...QUALIFYING_QUOTE,
            sentAt: { gte: prevMonthStart, lt: monthStart },
          },
        }),
        this.prisma.quotation.aggregate({
          _sum: { paidAmount: true },
          where: { ...QUALIFYING_QUOTE, sentAt: { gte: dayStart } },
        }),
      ]);

    // Payment record status counts — these are the "did the payment go
    // through" stats independent of the quotation lifecycle.
    const [paymentsPending, paymentsAwaitingConfirmation, paymentsSuccess, paymentsFailed, paymentsRejected] =
      await this.prisma.$transaction([
        this.prisma.payment.count({ where: { status: PaymentRecordStatus.pending } }),
        this.prisma.payment.count({
          where: { status: PaymentRecordStatus.awaiting_confirmation },
        }),
        this.prisma.payment.count({ where: { status: PaymentRecordStatus.success } }),
        this.prisma.payment.count({ where: { status: PaymentRecordStatus.failed } }),
        this.prisma.payment.count({ where: { status: PaymentRecordStatus.rejected } }),
      ]);

    // Treatment fees are billed INLINE on the order (separate from the
    // quotation / installment flow), so the quote aggregates above never
    // see them. Fold PAID treatment fees into the revenue totals so the
    // headline reflects packs (already captured in quotation.totalPrice)
    // PLUS the clinical treatment fee. Same date semantics as the quote
    // sums: a fee counts in the period it was actually PAID.
    const [tfRangeAgg, tfMonthAgg, tfPrevMonthAgg, tfTodayAgg] =
      await this.prisma.$transaction([
        this.prisma.dentalOrder.aggregate({
          _sum: { treatmentFeeAmount: true },
          where: {
            deletedAt: null,
            treatmentFeePaymentStatus: PaymentRecordStatus.success,
            treatmentFeePaidAt: { gte: range.from, lte: range.to },
          },
        }),
        this.prisma.dentalOrder.aggregate({
          _sum: { treatmentFeeAmount: true },
          where: {
            deletedAt: null,
            treatmentFeePaymentStatus: PaymentRecordStatus.success,
            treatmentFeePaidAt: { gte: monthStart },
          },
        }),
        this.prisma.dentalOrder.aggregate({
          _sum: { treatmentFeeAmount: true },
          where: {
            deletedAt: null,
            treatmentFeePaymentStatus: PaymentRecordStatus.success,
            treatmentFeePaidAt: { gte: prevMonthStart, lt: monthStart },
          },
        }),
        this.prisma.dentalOrder.aggregate({
          _sum: { treatmentFeeAmount: true },
          where: {
            deletedAt: null,
            treatmentFeePaymentStatus: PaymentRecordStatus.success,
            treatmentFeePaidAt: { gte: dayStart },
          },
        }),
      ]);
    const treatmentFeeRange = toNumber(tfRangeAgg._sum.treatmentFeeAmount);
    const treatmentFeeMonth = toNumber(tfMonthAgg._sum.treatmentFeeAmount);
    const treatmentFeePrevMonth = toNumber(tfPrevMonthAgg._sum.treatmentFeeAmount);
    const treatmentFeeToday = toNumber(tfTodayAgg._sum.treatmentFeeAmount);

    // Quote-only revenue kept separate so averageOrderValue (an "average
    // quote value") isn't skewed by the flat treatment fee.
    const quoteTotalRevenue = toNumber(paidQuoteAgg._sum.totalPrice);
    const totalRevenue = quoteTotalRevenue + treatmentFeeRange;
    const collectedAmount = toNumber(paidQuoteAgg._sum.paidAmount) +
      toNumber(unpaidQuoteAgg._sum.paidAmount) +
      treatmentFeeRange;
    const unpaidAmount =
      Math.max(0, toNumber(unpaidQuoteAgg._sum.totalPrice) - toNumber(unpaidQuoteAgg._sum.paidAmount));
    const revenueThisMonth = toNumber(monthQuoteAgg._sum.paidAmount) + treatmentFeeMonth;
    const revenuePrevMonth = toNumber(prevMonthQuoteAgg._sum.paidAmount) + treatmentFeePrevMonth;
    const revenueToday = toNumber(todayQuoteAgg._sum.paidAmount) + treatmentFeeToday;
    const monthlyGrowthPct =
      revenuePrevMonth === 0
        ? revenueThisMonth > 0 ? 100 : 0
        : ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100;

    const totalQuotationsInRange = allQuoteAgg._count._all;
    const paidQuotationsInRange = paidQuoteAgg._count._all;
    const conversionRate =
      totalQuotationsInRange === 0
        ? 0
        : (paidQuotationsInRange / totalQuotationsInRange) * 100;

    const averageOrderValue =
      paidQuotationsInRange === 0
        ? 0
        : quoteTotalRevenue / paidQuotationsInRange;

    // Best-selling pack (by paid quotations in range).
    const bestPack = await this.prisma.quotation.groupBy({
      by: ['packId'],
      _count: { _all: true },
      _sum: { totalPrice: true },
      where: {
        deletedAt: null,
        packId: { not: null },
        paymentStatus: QuotationPaymentStatus.paid,
        sentAt: { gte: range.from, lte: range.to },
      },
      orderBy: { _count: { packId: 'desc' } },
      take: 1,
    });
    const bestPackDetails = bestPack[0]?.packId
      ? await this.prisma.pack.findUnique({
          where: { id: bestPack[0].packId! },
          select: { id: true, name: true },
        })
      : null;

    const result = {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenue: {
        total: totalRevenue,
        today: revenueToday,
        thisMonth: revenueThisMonth,
        prevMonth: revenuePrevMonth,
        monthlyGrowthPct: Number(monthlyGrowthPct.toFixed(2)),
        collected: collectedAmount,
        unpaid: unpaidAmount,
      },
      doctors: {
        total: totalDoctors,
        active: activeDoctors,
        inactive: inactiveDoctors,
        newInRange: newDoctorsInRange,
      },
      patients: {
        total: totalPatients,
        newInRange: newPatientsInRange,
      },
      orders: {
        total: totalOrders,
        inRange: ordersInRange,
        today: ordersToday,
        thisMonth: ordersThisMonth,
        paid: paidQuotationsInRange,
        unpaid: unpaidQuoteAgg._count._all,
      },
      payments: {
        pending: paymentsPending,
        awaitingConfirmation: paymentsAwaitingConfirmation,
        completed: paymentsSuccess,
        failed: paymentsFailed,
        rejected: paymentsRejected,
      },
      packs: {
        active: activePacks,
        bestSelling: bestPackDetails
          ? {
              id: bestPackDetails.id,
              name: bestPackDetails.name,
              soldCount: bestPack[0]?._count._all ?? 0,
              revenue: toNumber(bestPack[0]?._sum.totalPrice ?? 0),
            }
          : null,
        conversionRatePct: Number(conversionRate.toFixed(2)),
        averageOrderValue: Number(averageOrderValue.toFixed(2)),
      },
    };

    await this.setCache(key, result);
    return result;
  }

  // ─── Analytics blocks (drill-down tables / chart series) ───────────

  async getTopDoctors(filter?: AdminAnalyticsLimitDto) {
    const range = this.resolveRange(filter);
    const limit = filter?.limit ?? 5;
    const key = `${this.cacheKey('topDoctors', range)}:${limit}`;
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;

    // Group quotations by doctor (via order.doctorId).
    const grouped = await this.prisma.quotation.groupBy({
      by: ['createdById'], // creator may or may not be the doctor; use order.doctorId below.
      where: {
        deletedAt: null,
        sentAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
      _sum: { totalPrice: true, paidAmount: true },
    });
    // The above gives us per-creator counts but the canonical "owning
    // doctor" is on dentalOrder. Do a second pass to roll quotations
    // by order.doctorId.
    const ordersInRange = await this.prisma.dentalOrder.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        doctorId: true,
        quotation: {
          select: {
            packId: true,
            status: true,
            totalPrice: true,
            paidAmount: true,
            paymentStatus: true,
          },
        },
      },
    });

    const byDoctor = new Map<
      string,
      { orders: number; paidOrders: number; revenue: number; outstanding: number }
    >();
    for (const o of ordersInRange) {
      const cur = byDoctor.get(o.doctorId) ?? {
        orders: 0,
        paidOrders: 0,
        revenue: 0,
        outstanding: 0,
      };
      cur.orders += 1;
      // QUALIFYING-QUOTE rule for paid / outstanding accounting:
      //   • packId set (admin priced the order)
      //   • status = approved (doctor committed to the quote)
      // An order missing either is NOT a real debt yet, so it stays
      // out of paidOrders + outstanding. It still counts in `orders`
      // so the row's order count is truthful.
      if (
        !o.quotation ||
        !o.quotation.packId ||
        o.quotation.status !== QuotationStatus.approved
      ) {
        byDoctor.set(o.doctorId, cur);
        continue;
      }
      const total = toNumber(o.quotation.totalPrice ?? 0);
      const paid = toNumber(o.quotation.paidAmount ?? 0);
      if (o.quotation.paymentStatus === QuotationPaymentStatus.paid) {
        cur.paidOrders += 1;
        cur.revenue += total;
      } else {
        cur.outstanding += Math.max(0, total - paid);
      }
      byDoctor.set(o.doctorId, cur);
    }

    const doctorIds = Array.from(byDoctor.keys());
    if (doctorIds.length === 0) {
      await this.setCache(key, []);
      return [];
    }
    const profiles = await this.prisma.user.findMany({
      where: { id: { in: doctorIds }, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        dentistProfile: { select: { clinicName: true, city: true } },
      },
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const rows = doctorIds
      .map((id) => {
        const stats = byDoctor.get(id)!;
        const profile = profileById.get(id);
        if (!profile) return null;
        return {
          doctorId: id,
          fullName: profile.fullName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          clinicName: profile.dentistProfile?.clinicName ?? null,
          city: profile.dentistProfile?.city ?? null,
          ...stats,
        };
      })
      .filter(Boolean) as Array<NonNullable<unknown>>;

    // Three ranked lists in one payload: by total orders, by paid
    // orders, by outstanding balance. Cheaper than three queries +
    // gives the admin all three views at once.
    const byOrders = [...rows]
      .sort(
        (a: any, b: any) =>
          b.orders - a.orders || b.revenue - a.revenue,
      )
      .slice(0, limit);
    const byPaidOrders = [...rows]
      .sort((a: any, b: any) => b.paidOrders - a.paidOrders || b.revenue - a.revenue)
      .slice(0, limit);
    const byOutstanding = [...rows]
      .sort((a: any, b: any) => b.outstanding - a.outstanding)
      .filter((r: any) => r.outstanding > 0)
      .slice(0, limit);

    const out = { byOrders, byPaidOrders, byOutstanding, _meta: { groupedRecords: grouped.length } };
    await this.setCache(key, out);
    return out;
  }

  async getBestPacks(filter?: AdminAnalyticsLimitDto) {
    const range = this.resolveRange(filter);
    const limit = filter?.limit ?? 10;
    const key = `${this.cacheKey('bestPacks', range)}:${limit}`;
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;

    const grouped = await this.prisma.quotation.groupBy({
      by: ['packId'],
      where: {
        deletedAt: null,
        packId: { not: null },
        sentAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
      _sum: { totalPrice: true, paidAmount: true },
      orderBy: { _count: { packId: 'desc' } },
      take: limit,
    });
    const packIds = grouped.map((g) => g.packId!).filter(Boolean);
    if (packIds.length === 0) {
      await this.setCache(key, []);
      return [];
    }
    const packs = await this.prisma.pack.findMany({
      where: { id: { in: packIds } },
      select: {
        id: true,
        name: true,
        isActive: true,
        prices: {
          where: { isActive: true },
          select: { archType: true, price: true, currency: true },
        },
      },
    });
    const byId = new Map(packs.map((p) => [p.id, p]));
    const rows = grouped.map((g) => {
      const p = byId.get(g.packId!);
      const activePrice = p?.prices.find((x) => x.archType === 'two_arches')
        ?? p?.prices[0];
      return {
        packId: g.packId,
        name: p?.name ?? '(deleted pack)',
        isActive: p?.isActive ?? false,
        sold: g._count._all,
        revenue: toNumber(g._sum.totalPrice),
        collected: toNumber(g._sum.paidAmount),
        currentPrice: toNumber(activePrice?.price ?? 0),
        currency: activePrice?.currency ?? 'TND',
      };
    });

    await this.setCache(key, rows);
    return rows;
  }

  /**
   * Daily revenue + order series for chart rendering.
   *
   * Returns one bucket per day between `from` and `to` (inclusive)
   * with the paid amount for that day and the order-created count
   * for that day. Frontend lays this out as a stacked area chart.
   */
  async getTrends(rangeIn?: DashboardRangeDto) {
    const range = this.resolveRange(rangeIn);
    const key = this.cacheKey('trends', range);
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;

    // For the range, walk day-by-day; cap at 180 days to avoid huge
    // payloads. The frontend can request a smaller range if needed.
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.min(
      Math.ceil((range.to.getTime() - range.from.getTime()) / dayMs) + 1,
      180,
    );
    const points: Array<{
      date: string;
      revenue: number;
      orders: number;
      newDoctors: number;
      newPatients: number;
    }> = [];

    // Pull all relevant rows in three queries, then bucket in memory.
    // For 100k+ records we'd switch to raw SQL date_trunc — left as a
    // TODO when this becomes the bottleneck.
    const [payments, orders, doctors, patients] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: {
          status: PaymentRecordStatus.success,
          paidAt: { gte: range.from, lte: range.to },
        },
        select: { paidAt: true, amount: true },
      }),
      this.prisma.dentalOrder.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: {
          role: UserRole.dentist,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { createdAt: true },
      }),
      this.prisma.patient.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { createdAt: true },
      }),
    ]);

    const keyForDate = (d: Date | null): string | null => {
      if (!d) return null;
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.toISOString().slice(0, 10);
    };

    const buckets: Record<string, { revenue: number; orders: number; newDoctors: number; newPatients: number }> = {};

    for (let i = 0; i < totalDays; i++) {
      const day = new Date(range.from.getTime() + i * dayMs);
      day.setHours(0, 0, 0, 0);
      const k = day.toISOString().slice(0, 10);
      buckets[k] = { revenue: 0, orders: 0, newDoctors: 0, newPatients: 0 };
    }
    for (const p of payments) {
      const k = keyForDate(p.paidAt);
      if (k && buckets[k]) buckets[k].revenue += toNumber(p.amount);
    }
    for (const o of orders) {
      const k = keyForDate(o.createdAt);
      if (k && buckets[k]) buckets[k].orders += 1;
    }
    for (const d of doctors) {
      const k = keyForDate(d.createdAt);
      if (k && buckets[k]) buckets[k].newDoctors += 1;
    }
    for (const pt of patients) {
      const k = keyForDate(pt.createdAt);
      if (k && buckets[k]) buckets[k].newPatients += 1;
    }
    for (const date of Object.keys(buckets).sort()) {
      points.push({ date, ...buckets[date] });
    }

    const out = { range, points };
    await this.setCache(key, out);
    return out;
  }

  // ─── Cache busting (called from the events listener) ───────────────

  async invalidateAll(): Promise<void> {
    if (this.knownCacheKeys.size === 0) return;
    await Promise.all(
      Array.from(this.knownCacheKeys).map((key) =>
        this.cache.del(key).catch((err) => {
          this.logger.warn(
            `Failed to invalidate admin dashboard cache key ${key}: ${(err as Error).message}`,
          );
        }),
      ),
    );
    this.knownCacheKeys.clear();
  }

  private async setCache<T>(key: string, value: T): Promise<void> {
    this.knownCacheKeys.add(key);
    await this.cache.set(key, value, CACHE_TTL_MS);
  }
}
