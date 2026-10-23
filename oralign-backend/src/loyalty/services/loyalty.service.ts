import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LoyaltyCalculationBasis, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '../../common/exceptions/app.exception';
import {
  LoyaltyDoctorRowDto,
  LoyaltyOverviewDto,
  LoyaltyQuarterInfoDto,
  LoyaltyTierDto,
  UpdateLoyaltyTiersDto,
} from '../dto/loyalty.dto';
import {
  QuarterRef,
  previousQuarter,
  quarterLabel,
  quarterOf,
  quarterPeriod,
} from '../loyalty.types';
import { LoyaltyEligibilityService } from './loyalty-eligibility.service';
import { highestReachedTier, type LoyaltyTierRule } from '../loyalty.rules';

// Plain timers instead of @nestjs/schedule — matches UploadCleanupService
// and MediaReconciliationService, no extra dependency. The sweep only has
// to run "sometime after each quarter boundary", so a slow cadence with a
// lazy fallback (closure also happens on demand, see activeDiscountPercent)
// makes a missed tick harmless.
const BOOT_DELAY_MS = 30_000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

export interface ActiveLoyaltyReward {
  discountPercent: number;
  sourceYear: number | null;
  sourceQuarter: number | null;
}

/**
 * The single home of the quarterly loyalty policy. Qualification is
 * derived from DentalOrder source rows: an order counts once when its
 * status is `finished`, its immutable createdAt belongs to the quarter,
 * and no positive loyalty snapshot was actually applied to its quote.
 *
 * Closing a quarter persists one LoyaltyQuarterResult per doctor with
 * the awarded percent SNAPSHOTTED, so editing tiers later never
 * rewrites a closed quarter — and the discount a quote received is
 * additionally frozen on the quote itself (loyaltyDiscountPercent).
 *
 * The discount is applied in exactly ONE place — attachPack, via
 * activeRewardFor() — which re-derives the price from the pack
 * on every call, so re-attaching can never stack discounts.
 */
@Injectable()
export class LoyaltyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyService.name);
  private bootTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: LoyaltyEligibilityService,
  ) {}

  onModuleInit(): void {
    this.bootTimer = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    this.bootTimer.unref?.();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Close the previous quarter if it is not closed yet. Idempotent. */
  private async sweep(): Promise<void> {
    try {
      await this.ensureQuarterClosed(previousQuarter(quarterOf(new Date())));
    } catch (err) {
      this.logger.error(
        `Loyalty quarter sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Tiers ─────────────────────────────────────────────────────────

  private async activeTiers(): Promise<LoyaltyTierRule[]> {
    const rows = await this.prisma.loyaltyTier.findMany({
      where: { isActive: true },
      orderBy: { minTreatments: 'asc' },
    });
    return rows.map((t) => ({
      minTreatments: t.minTreatments,
      discountPercent: num(t.discountPercent),
    }));
  }

  private tierFor(
    count: number,
    tiers: LoyaltyTierRule[],
  ): LoyaltyTierRule | null {
    return highestReachedTier(count, tiers);
  }

  async listTiers(): Promise<LoyaltyTierDto[]> {
    const rows = await this.prisma.loyaltyTier.findMany({
      where: { isActive: true },
      orderBy: { minTreatments: 'asc' },
    });
    return rows.map((t) => ({
      id: t.id,
      minTreatments: t.minTreatments,
      discountPercent: t.discountPercent.toString(),
    }));
  }

  /**
   * Full replacement of the active tier list. Old rows are deactivated
   * (never deleted): closed quarters carry their own snapshots, but
   * keeping the rows makes the audit trail readable.
   */
  async updateTiers(dto: UpdateLoyaltyTiersDto): Promise<LoyaltyTierDto[]> {
    const sorted = [...dto.tiers].sort(
      (a, b) => a.minTreatments - b.minTreatments,
    );
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minTreatments === sorted[i - 1].minTreatments) {
        throw new BadRequestException(
          'Two tiers cannot share the same eligible-order threshold.',
          'LOYALTY_TIERS_DUPLICATE',
        );
      }
      if (sorted[i].discountPercent < sorted[i - 1].discountPercent) {
        throw new BadRequestException(
          'A higher tier cannot grant a smaller discount than a lower one.',
          'LOYALTY_TIERS_NOT_MONOTONIC',
        );
      }
    }

    // Close any finished-but-unclosed quarter under the grid it was
    // earned with BEFORE swapping the ladder — otherwise an edit landing
    // in the gap between quarter end and the next sweep would rewrite
    // what the previous quarter awards. If closing fails, aborting the
    // edit is the safe outcome.
    await this.ensureQuarterClosed(previousQuarter(quarterOf(new Date())));

    await this.prisma.$transaction(async (tx) => {
      await tx.loyaltyTier.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      for (const tier of sorted) {
        await tx.loyaltyTier.create({
          data: {
            minTreatments: tier.minTreatments,
            discountPercent: new Prisma.Decimal(
              tier.discountPercent.toFixed(2),
            ),
          },
        });
      }
    });

    return this.listTiers();
  }

  private parseTierSnapshot(
    value: Prisma.JsonValue | null,
  ): LoyaltyTierRule[] | null {
    if (!Array.isArray(value)) return null;
    const tiers: LoyaltyTierRule[] = [];
    for (const row of value) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const raw = row as Record<string, unknown>;
      const minTreatments = Number(raw.minTreatments);
      const discountPercent = Number(raw.discountPercent);
      if (
        !Number.isInteger(minTreatments) ||
        minTreatments < 1 ||
        !Number.isFinite(discountPercent) ||
        discountPercent < 0 ||
        discountPercent > 100
      ) {
        return null;
      }
      tiers.push({ minTreatments, discountPercent });
    }
    return tiers.sort((a, b) => a.minTreatments - b.minTreatments);
  }

  private tierSnapshot(tiers: LoyaltyTierRule[]): Prisma.InputJsonValue {
    return tiers.map((tier) => ({
      minTreatments: tier.minTreatments,
      discountPercent: tier.discountPercent.toFixed(2),
    }));
  }

  // ── Quarter closing ───────────────────────────────────────────────

  /**
   * Recalculate a FINISHED quarter from immutable order IDs. Upserting on
   * (doctor, year, quarter) makes repeated jobs and API retries idempotent.
   * Tier rules are snapshotted on the first v2 calculation, so later admin
   * edits cannot rewrite the commercial reward earned in this quarter.
   */
  async ensureQuarterClosed(ref: QuarterRef): Promise<void> {
    const { end } = quarterPeriod(ref);
    if (end.getTime() > Date.now()) {
      throw new BadRequestException(
        `Quarter ${quarterLabel(ref)} is not over yet.`,
        'LOYALTY_QUARTER_NOT_OVER',
      );
    }

    const [metrics, existing] = await Promise.all([
      this.eligibility.metricsByDoctor(ref),
      this.prisma.loyaltyQuarterResult.findMany({
        where: { year: ref.year, quarter: ref.quarter },
      }),
    ]);
    const doctorIds = new Set<string>([
      ...metrics.keys(),
      ...existing.map((row) => row.doctorId),
    ]);
    if (doctorIds.size === 0) return;

    const existingByDoctor = new Map(
      existing.map((row) => [row.doctorId, row]),
    );
    const quarterSnapshot =
      existing
        .map((row) => this.parseTierSnapshot(row.tierSnapshot))
        .find((value): value is LoyaltyTierRule[] => value !== null) ??
      (await this.activeTiers());
    const computedAt = new Date();

    for (const doctorId of doctorIds) {
      const doctorMetrics = metrics.get(doctorId) ?? {
        eligibleOrderCount: 0,
        excludedDiscountedOrderCount: 0,
      };
      const tiers =
        this.parseTierSnapshot(
          existingByDoctor.get(doctorId)?.tierSnapshot ?? null,
        ) ?? quarterSnapshot;
      const tier = this.tierFor(doctorMetrics.eligibleOrderCount, tiers);
      const result = {
        treatmentCount: doctorMetrics.eligibleOrderCount,
        excludedDiscountedOrderCount:
          doctorMetrics.excludedDiscountedOrderCount,
        calculationBasis: LoyaltyCalculationBasis.completed_orders_v2,
        tierSnapshot: this.tierSnapshot(tiers),
        tierMinTreatments: tier?.minTreatments ?? null,
        discountPercent: new Prisma.Decimal(
          (tier?.discountPercent ?? 0).toFixed(2),
        ),
        computedAt,
      };
      await this.prisma.loyaltyQuarterResult.upsert({
        where: {
          doctorId_year_quarter: {
            doctorId,
            year: ref.year,
            quarter: ref.quarter,
          },
        },
        update: result,
        create: {
          doctorId,
          year: ref.year,
          quarter: ref.quarter,
          ...result,
        },
      });
    }
    this.logger.log(
      `Loyalty quarter ${quarterLabel(ref)} recalculated from completed orders for ${doctorIds.size} practitioner(s).`,
    );
  }

  // ── Discount resolution (consumed by attachPack) ──────────────────

  /**
   * Discount percent applying to a quote created NOW for this doctor:
   * the tier earned in the PREVIOUS quarter, from its closed snapshot.
   * Lazily closes that quarter first, so the program works without any
   * external cron. Returns 0 when the program is disabled.
   */
  async activeRewardFor(
    doctorId: string,
    at = new Date(),
  ): Promise<ActiveLoyaltyReward> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      select: { loyaltyEnabled: true },
    });
    if (settings && !settings.loyaltyEnabled) {
      return { discountPercent: 0, sourceYear: null, sourceQuarter: null };
    }

    const prev = previousQuarter(quarterOf(at));
    try {
      await this.ensureQuarterClosed(prev);
    } catch {
      // Closing can only fail transiently (DB hiccup) — fall through and
      // read whatever snapshot exists; worst case the discount is 0 and
      // the admin can re-attach the pack after a recompute.
    }
    const result = await this.prisma.loyaltyQuarterResult.findUnique({
      where: {
        doctorId_year_quarter: {
          doctorId,
          year: prev.year,
          quarter: prev.quarter,
        },
      },
    });
    if (
      !result ||
      result.calculationBasis !== LoyaltyCalculationBasis.completed_orders_v2
    ) {
      return { discountPercent: 0, sourceYear: null, sourceQuarter: null };
    }
    return {
      discountPercent: num(result.discountPercent),
      sourceYear: prev.year,
      sourceQuarter: prev.quarter,
    };
  }

  /** Backward-compatible convenience used by any older internal caller. */
  async activeDiscountPercentFor(doctorId: string): Promise<number> {
    return (await this.activeRewardFor(doctorId)).discountPercent;
  }

  // ── Admin overview ────────────────────────────────────────────────

  private quarterInfo(ref: QuarterRef): LoyaltyQuarterInfoDto {
    const period = quarterPeriod(ref);
    return {
      year: ref.year,
      quarter: ref.quarter,
      label: quarterLabel(ref),
      startsAt: period.start.toISOString(),
      endsAt: period.end.toISOString(),
    };
  }

  async overview(): Promise<LoyaltyOverviewDto> {
    const now = new Date();
    const current = quarterOf(now);
    const prev = previousQuarter(current);

    // Close the previous quarter on demand — the overview must reflect
    // reality even if the server slept through the boundary.
    try {
      await this.ensureQuarterClosed(prev);
    } catch {
      /* transient — the table simply shows what is already closed */
    }

    const [settings, tierRows, currentMetrics, prevResults, discountAgg] =
      await Promise.all([
        this.prisma.companyBillingSettings.findFirst({
          where: { isActive: true },
          select: { loyaltyEnabled: true, defaultCurrency: true },
        }),
        this.prisma.loyaltyTier.findMany({
          where: { isActive: true },
          orderBy: { minTreatments: 'asc' },
        }),
        this.eligibility.metricsByDoctor(current),
        this.prisma.loyaltyQuarterResult.findMany({
          where: { year: prev.year, quarter: prev.quarter },
        }),
        this.prisma.quotation.aggregate({
          where: {
            deletedAt: null,
            createdAt: {
              gte: quarterPeriod(current).start,
              lt: quarterPeriod(current).end,
            },
            loyaltyDiscountAmount: { gt: 0 },
          },
          _sum: { loyaltyDiscountAmount: true },
        }),
      ]);

    const tiers: LoyaltyTierRule[] = tierRows.map((t) => ({
      minTreatments: t.minTreatments,
      discountPercent: Number(t.discountPercent),
    }));
    const prevByDoctor = new Map(prevResults.map((r) => [r.doctorId, r]));

    // The table covers every practitioner with loyalty activity: counted
    // this quarter, counted last quarter, or carrying an active discount.
    const doctorIds = new Set<string>([
      ...currentMetrics.keys(),
      ...prevByDoctor.keys(),
    ]);

    const users = doctorIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...doctorIds] } },
          select: {
            id: true,
            fullName: true,
            dentistProfile: { select: { clinicName: true } },
          },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const doctors: LoyaltyDoctorRowDto[] = [...doctorIds].map((doctorId) => {
      const user = userById.get(doctorId);
      const metrics = currentMetrics.get(doctorId) ?? {
        eligibleOrderCount: 0,
        excludedDiscountedOrderCount: 0,
      };
      const prevResult = prevByDoctor.get(doctorId);
      const previousIsOrderBased =
        prevResult?.calculationBasis ===
        LoyaltyCalculationBasis.completed_orders_v2;
      const currentTier = this.tierFor(metrics.eligibleOrderCount, tiers);
      const nextTier =
        tiers.find((t) => t.minTreatments > metrics.eligibleOrderCount) ?? null;
      return {
        doctorId,
        doctorName: user?.fullName ?? '—',
        clinicName: user?.dentistProfile?.clinicName ?? null,
        eligibleOrdersThisQuarter: metrics.eligibleOrderCount,
        excludedDiscountedOrdersThisQuarter:
          metrics.excludedDiscountedOrderCount,
        achievedTierPercent: currentTier?.discountPercent ?? 0,
        activeDiscountPercent:
          (settings?.loyaltyEnabled ?? true) && previousIsOrderBased
            ? num(prevResult?.discountPercent)
            : 0,
        projectedNextQuarterDiscountPercent: currentTier?.discountPercent ?? 0,
        nextTierMinOrders: nextTier?.minTreatments ?? null,
        nextTierPercent: nextTier?.discountPercent ?? null,
        remainingOrdersToNextTier: nextTier
          ? nextTier.minTreatments - metrics.eligibleOrderCount
          : null,
        previousEligibleOrderCount: previousIsOrderBased
          ? (prevResult?.treatmentCount ?? 0)
          : 0,
        previousExcludedDiscountedOrderCount: previousIsOrderBased
          ? (prevResult?.excludedDiscountedOrderCount ?? 0)
          : 0,
        previousDiscountPercent: previousIsOrderBased
          ? num(prevResult?.discountPercent)
          : 0,
      };
    });

    // Highest tier first in the table, then by progress.
    doctors.sort(
      (a, b) =>
        b.eligibleOrdersThisQuarter - a.eligibleOrdersThisQuarter ||
        a.doctorName.localeCompare(b.doctorName),
    );

    const eligibleByTier = tiers.map((tier) => ({
      minTreatments: tier.minTreatments,
      discountPercent: tier.discountPercent,
      doctors: doctors.filter(
        (d) =>
          d.eligibleOrdersThisQuarter >= tier.minTreatments &&
          this.tierFor(d.eligibleOrdersThisQuarter, tiers)?.minTreatments ===
            tier.minTreatments,
      ).length,
    }));

    let eligibleOrdersThisQuarter = 0;
    let excludedDiscountedOrdersThisQuarter = 0;
    for (const metrics of currentMetrics.values()) {
      eligibleOrdersThisQuarter += metrics.eligibleOrderCount;
      excludedDiscountedOrdersThisQuarter +=
        metrics.excludedDiscountedOrderCount;
    }

    return {
      enabled: settings?.loyaltyEnabled ?? true,
      currentQuarter: this.quarterInfo(current),
      previousQuarter: this.quarterInfo(prev),
      tiers: tierRows.map((t) => ({
        id: t.id,
        minTreatments: t.minTreatments,
        discountPercent: t.discountPercent.toString(),
      })),
      kpis: {
        eligibleOrdersThisQuarter,
        excludedDiscountedOrdersThisQuarter,
        eligibleByTier,
        discountsGrantedThisQuarter: round3(
          num(discountAgg._sum.loyaltyDiscountAmount),
        ),
        currency: settings?.defaultCurrency ?? 'TND',
      },
      doctors,
    };
  }
}
