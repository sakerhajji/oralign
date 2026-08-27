import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
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

interface TierShape {
  minTreatments: number;
  discountPercent: number;
}

/**
 * The single home of every loyalty rule (grille 2026):
 *
 *   « 8 traitements par trimestre → 5 % de remise sur tous les cas du
 *     trimestre suivant ; 12 ou plus → 10 %. Tous forfaits confondus,
 *     recalcul à chaque fin de trimestre. »
 *
 * A TREATMENT is a pack quotation the doctor APPROVED during the
 * quarter (Quotation.doctorApprovedAt) — per the tariff sheet the pack
 * is only ordered after the treatment plan is validated, and the quote
 * approval is exactly that commitment. Cancelled / deleted quotes never
 * count (status must still be `approved`).
 *
 * Closing a quarter persists one LoyaltyQuarterResult per doctor with
 * the awarded percent SNAPSHOTTED, so editing tiers later never
 * rewrites a closed quarter — and the discount a quote received is
 * additionally frozen on the quote itself (loyaltyDiscountPercent).
 *
 * The discount is applied in exactly ONE place — attachPack, via
 * activeDiscountPercentFor() — which re-derives the price from the pack
 * on every call, so re-attaching can never stack discounts.
 */
@Injectable()
export class LoyaltyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyService.name);
  private bootTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

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

  private async activeTiers(): Promise<TierShape[]> {
    const rows = await this.prisma.loyaltyTier.findMany({
      where: { isActive: true },
      orderBy: { minTreatments: 'asc' },
    });
    return rows.map((t) => ({
      minTreatments: t.minTreatments,
      discountPercent: num(t.discountPercent),
    }));
  }

  private tierFor(count: number, tiers: TierShape[]): TierShape | null {
    let reached: TierShape | null = null;
    for (const tier of tiers) {
      if (count >= tier.minTreatments) reached = tier;
    }
    return reached;
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
    const sorted = [...dto.tiers].sort((a, b) => a.minTreatments - b.minTreatments);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minTreatments === sorted[i - 1].minTreatments) {
        throw new BadRequestException(
          'Two tiers cannot share the same treatment threshold.',
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
            discountPercent: new Prisma.Decimal(tier.discountPercent.toFixed(2)),
          },
        });
      }
    });

    return this.listTiers();
  }

  // ── Counting ──────────────────────────────────────────────────────

  /** Approved-quote count per doctor within a quarter (live). */
  private async countsByDoctor(ref: QuarterRef): Promise<Map<string, number>> {
    const { start, end } = quarterPeriod(ref);
    const rows = await this.prisma.quotation.findMany({
      where: {
        status: QuotationStatus.approved,
        doctorApprovedAt: { gte: start, lt: end },
        // A treatment is a PACK quotation — legacy free-form quotes
        // approved through the same transition do not count.
        packId: { not: null },
        deletedAt: null,
        order: { deletedAt: null },
      },
      select: { order: { select: { doctorId: true } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const id = row.order.doctorId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  // ── Quarter closing ───────────────────────────────────────────────

  /**
   * Persist the results of a FINISHED quarter. Refuses to close the
   * current or a future quarter (its count is still moving). Existing
   * rows are left untouched — a closed quarter is history.
   */
  async ensureQuarterClosed(ref: QuarterRef): Promise<void> {
    const { end } = quarterPeriod(ref);
    if (end.getTime() > Date.now()) {
      throw new BadRequestException(
        `Quarter ${quarterLabel(ref)} is not over yet.`,
        'LOYALTY_QUARTER_NOT_OVER',
      );
    }

    const counts = await this.countsByDoctor(ref);
    if (counts.size === 0) return;

    const tiers = await this.activeTiers();
    for (const [doctorId, treatmentCount] of counts) {
      const tier = this.tierFor(treatmentCount, tiers);
      await this.prisma.loyaltyQuarterResult.upsert({
        where: {
          doctorId_year_quarter: { doctorId, year: ref.year, quarter: ref.quarter },
        },
        // Already closed → keep the historical snapshot untouched.
        update: {},
        create: {
          doctorId,
          year: ref.year,
          quarter: ref.quarter,
          treatmentCount,
          tierMinTreatments: tier?.minTreatments ?? null,
          discountPercent: new Prisma.Decimal(
            (tier?.discountPercent ?? 0).toFixed(2),
          ),
        },
      });
    }
    this.logger.log(
      `Loyalty quarter ${quarterLabel(ref)} closed for ${counts.size} practitioner(s).`,
    );
  }

  // ── Discount resolution (consumed by attachPack) ──────────────────

  /**
   * Discount percent applying to a quote created NOW for this doctor:
   * the tier earned in the PREVIOUS quarter, from its closed snapshot.
   * Lazily closes that quarter first, so the program works without any
   * external cron. Returns 0 when the program is disabled.
   */
  async activeDiscountPercentFor(doctorId: string): Promise<number> {
    const settings = await this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      select: { loyaltyEnabled: true },
    });
    if (settings && !settings.loyaltyEnabled) return 0;

    const prev = previousQuarter(quarterOf(new Date()));
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
    return num(result?.discountPercent);
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

    const [settings, tierRows, currentCounts, prevResults, discountAgg] =
      await Promise.all([
        this.prisma.companyBillingSettings.findFirst({
          where: { isActive: true },
          select: { loyaltyEnabled: true, defaultCurrency: true },
        }),
        this.prisma.loyaltyTier.findMany({
          where: { isActive: true },
          orderBy: { minTreatments: 'asc' },
        }),
        this.countsByDoctor(current),
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

    const tiers: TierShape[] = tierRows.map((t) => ({
      minTreatments: t.minTreatments,
      discountPercent: Number(t.discountPercent),
    }));
    const prevByDoctor = new Map(prevResults.map((r) => [r.doctorId, r]));

    // The table covers every practitioner with loyalty activity: counted
    // this quarter, counted last quarter, or carrying an active discount.
    const doctorIds = new Set<string>([
      ...currentCounts.keys(),
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
      const currentCount = currentCounts.get(doctorId) ?? 0;
      const prevResult = prevByDoctor.get(doctorId);
      const currentTier = this.tierFor(currentCount, tiers);
      const nextTier =
        tiers.find((t) => t.minTreatments > currentCount) ?? null;
      return {
        doctorId,
        doctorName: user?.fullName ?? '—',
        clinicName: user?.dentistProfile?.clinicName ?? null,
        currentCount,
        currentTierPercent: currentTier?.discountPercent ?? 0,
        activeDiscountPercent: num(prevResult?.discountPercent),
        nextQuarterDiscountPercent: currentTier?.discountPercent ?? 0,
        nextTierMinTreatments: nextTier?.minTreatments ?? null,
        nextTierPercent: nextTier?.discountPercent ?? null,
        remainingToNextTier: nextTier
          ? nextTier.minTreatments - currentCount
          : null,
        previousCount: prevResult?.treatmentCount ?? 0,
        previousDiscountPercent: num(prevResult?.discountPercent),
      };
    });

    // Highest tier first in the table, then by progress.
    doctors.sort(
      (a, b) => b.currentCount - a.currentCount || a.doctorName.localeCompare(b.doctorName),
    );

    const eligibleByTier = tiers.map((tier) => ({
      minTreatments: tier.minTreatments,
      discountPercent: tier.discountPercent,
      doctors: doctors.filter(
        (d) =>
          d.currentCount >= tier.minTreatments &&
          this.tierFor(d.currentCount, tiers)?.minTreatments === tier.minTreatments,
      ).length,
    }));

    let treatmentsThisQuarter = 0;
    for (const count of currentCounts.values()) treatmentsThisQuarter += count;

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
        treatmentsThisQuarter,
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
