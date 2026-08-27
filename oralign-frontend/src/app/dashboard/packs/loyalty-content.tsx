'use client';

/**
 * Admin "Fidélité" tab of /dashboard/packs — the quarterly loyalty
 * program (grille 2026). Everything shown here is computed by the
 * backend LoyaltyService (single home of the rules); this surface only
 * renders and edits.
 */

import { useMemo, useState } from 'react';
import {
  Award,
  CalendarRange,
  Loader2,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Stethoscope,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KpiCard, KpiGrid } from '@/components/dashboard/kpi-card';
import { useT } from '@/lib/i18n/lang-context';
import { formatPrice } from '@/lib/utils/currency';
import {
  useLoyaltyOverview,
  useRecomputeLoyalty,
  useUpdateLoyaltyTiers,
} from '@/lib/hooks/use-loyalty';
import type { LoyaltyDoctorRow, LoyaltyTierInput } from '@/lib/types/loyalty';

const formatPercent = (value: number | string): string => {
  const n = typeof value === 'string' ? Number(value) : value;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
};

export function LoyaltyContent() {
  const { t, lang } = useT();
  const overviewQuery = useLoyaltyOverview();
  const recompute = useRecomputeLoyalty();
  const [rulesOpen, setRulesOpen] = useState(false);

  const overview = overviewQuery.data;

  const quarterRange = useMemo(() => {
    if (!overview) return '';
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const fmt = (iso: string, endExclusive = false) => {
      const date = new Date(iso);
      if (endExclusive) date.setUTCDate(date.getUTCDate() - 1);
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    };
    return `${fmt(overview.currentQuarter.startsAt)} → ${fmt(overview.currentQuarter.endsAt, true)}`;
  }, [overview, lang]);

  if (overviewQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (overviewQuery.isError || !overview) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {t('loyaltyAdmin.loadError')}
          </p>
          <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()}>
            <RefreshCw className="mr-2 size-4" />
            {t('loyaltyAdmin.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tierKpis = overview.kpis.eligibleByTier;

  return (
    <div className="flex flex-col gap-5">
      {/* Disabled warning */}
      {!overview.enabled && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {t('loyaltyAdmin.disabledBanner')}
        </div>
      )}

      {/* Quarter banner + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="size-4 text-primary" />
          <span className="font-medium text-foreground">
            {t('loyaltyAdmin.currentQuarter')} · {overview.currentQuarter.label}
          </span>
          <span className="hidden sm:inline">— {quarterRange}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
          >
            {recompute.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {t('loyaltyAdmin.recompute')}
          </Button>
          <Button size="sm" onClick={() => setRulesOpen(true)}>
            <Pencil className="mr-2 size-4" />
            {t('loyaltyAdmin.editRules')}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <KpiGrid>
        <KpiCard
          label={t('loyaltyAdmin.kpiTreatments')}
          value={overview.kpis.treatmentsThisQuarter}
          icon={Stethoscope}
          tone="primary"
          footerLabel={overview.currentQuarter.label}
        />
        {tierKpis.map((tier) => (
          <KpiCard
            key={tier.minTreatments}
            label={t('loyaltyAdmin.kpiEligible', {
              percent: Number.isInteger(tier.discountPercent)
                ? tier.discountPercent
                : tier.discountPercent.toFixed(2),
            })}
            value={tier.doctors}
            icon={Award}
            tone={tier.discountPercent >= 10 ? 'violet' : 'emerald'}
            footerLabel={t('loyaltyAdmin.ruleLine', {
              count: tier.minTreatments,
              percent: tier.discountPercent,
            })}
          />
        ))}
        <KpiCard
          label={t('loyaltyAdmin.kpiDiscounts')}
          value={formatPrice(
            overview.kpis.discountsGrantedThisQuarter,
            overview.kpis.currency,
          )}
          icon={Percent}
          tone="amber"
          footerLabel={t('loyaltyAdmin.kpiDiscountsHint')}
        />
      </KpiGrid>

      {/* Rules card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">
              {t('loyaltyAdmin.rulesTitle')}
            </CardTitle>
            <CardDescription>{t('loyaltyAdmin.rulesHint')}</CardDescription>
          </div>
          <TrendingUp className="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {overview.tiers.map((tier) => (
            <div
              key={tier.id}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
            >
              <Badge variant="secondary" className="tabular-nums">
                {formatPercent(tier.discountPercent)}
              </Badge>
              <span>
                {t('loyaltyAdmin.ruleLine', {
                  count: tier.minTreatments,
                  percent: Number(tier.discountPercent),
                })}
              </span>
            </div>
          ))}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('loyaltyAdmin.treatmentDefinition')}
          </p>
        </CardContent>
      </Card>

      {/* Practitioner table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('loyaltyAdmin.tableTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overview.doctors.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">{t('loyaltyAdmin.emptyTitle')}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {t('loyaltyAdmin.emptyBody')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('loyaltyAdmin.colPractitioner')}</TableHead>
                      <TableHead className="min-w-[260px]">
                        {t('loyaltyAdmin.colProgress')}
                      </TableHead>
                      <TableHead>{t('loyaltyAdmin.colCurrentReward')}</TableHead>
                      <TableHead>{t('loyaltyAdmin.colNextQuarter')}</TableHead>
                      <TableHead>{t('loyaltyAdmin.colPrevious')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.doctors.map((doctor) => (
                      <TableRow key={doctor.doctorId}>
                        <TableCell>
                          <div className="font-medium">{doctor.doctorName}</div>
                          {doctor.clinicName && (
                            <div className="text-xs text-muted-foreground">
                              {doctor.clinicName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <DoctorProgress doctor={doctor} hasTiers={overview.tiers.length > 0} />
                        </TableCell>
                        <TableCell>
                          <RewardBadge
                            percent={doctor.activeDiscountPercent}
                            hint={t('loyaltyAdmin.activeDiscountHint', {
                              quarter: overview.previousQuarter.label,
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          {doctor.nextQuarterDiscountPercent > 0 ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              {t('loyaltyAdmin.securedNext', {
                                percent: doctor.nextQuarterDiscountPercent,
                              })}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {t('loyaltyAdmin.noReward')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t('loyaltyAdmin.previousCell', {
                            count: doctor.previousCount,
                            percent: doctor.previousDiscountPercent,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 lg:hidden">
                {overview.doctors.map((doctor) => (
                  <div
                    key={doctor.doctorId}
                    className="rounded-lg border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{doctor.doctorName}</div>
                        {doctor.clinicName && (
                          <div className="text-xs text-muted-foreground">
                            {doctor.clinicName}
                          </div>
                        )}
                      </div>
                      <RewardBadge percent={doctor.activeDiscountPercent} />
                    </div>
                    <div className="mt-3">
                      <DoctorProgress doctor={doctor} hasTiers={overview.tiers.length > 0} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('loyaltyAdmin.colPrevious')} :{' '}
                      {t('loyaltyAdmin.previousCell', {
                        count: doctor.previousCount,
                        percent: doctor.previousDiscountPercent,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <LoyaltyRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        initialTiers={overview.tiers.map((tier) => ({
          minTreatments: tier.minTreatments,
          discountPercent: Number(tier.discountPercent),
        }))}
      />
    </div>
  );
}

// ── Progress cell ────────────────────────────────────────────────────

function DoctorProgress({
  doctor,
  hasTiers,
}: {
  doctor: LoyaltyDoctorRow;
  hasTiers: boolean;
}) {
  const { t } = useT();
  const target = doctor.nextTierMinTreatments;
  // nextTier=null means either "above the top tier" or "no tiers
  // configured at all" — only the former earns a full bar.
  const percent = target
    ? Math.min(100, (doctor.currentCount / target) * 100)
    : hasTiers
      ? 100
      : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {target
            ? t('loyaltyAdmin.progressCount', {
                count: doctor.currentCount,
                target,
              })
            : hasTiers
              ? t('loyaltyAdmin.progressTopTier', { count: doctor.currentCount })
              : t('loyaltyAdmin.progressNoTiers', { count: doctor.currentCount })}
        </span>
        {doctor.currentTierPercent > 0 && (
          <Badge variant="outline" className="tabular-nums">
            {formatPercent(doctor.currentTierPercent)}
          </Badge>
        )}
      </div>
      <Progress value={percent} className="h-2" />
      {target && doctor.remainingToNextTier != null && doctor.nextTierPercent != null && (
        <p className="text-xs text-muted-foreground">
          {t('loyaltyAdmin.remainingHint', {
            remaining: doctor.remainingToNextTier,
            percent: doctor.nextTierPercent,
          })}
        </p>
      )}
    </div>
  );
}

function RewardBadge({ percent, hint }: { percent: number; hint?: string }) {
  const { t } = useT();
  if (percent <= 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {t('loyaltyAdmin.noReward')}
      </span>
    );
  }
  return (
    <div>
      <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
        −{formatPercent(percent)}
      </Badge>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ── Tier editor dialog ───────────────────────────────────────────────

function LoyaltyRulesDialog({
  open,
  onOpenChange,
  initialTiers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTiers: LoyaltyTierInput[];
}) {
  const { t } = useT();
  const updateTiers = useUpdateLoyaltyTiers();
  const [tiers, setTiers] = useState<LoyaltyTierInput[]>(initialTiers);

  // Reset the draft each time the dialog opens on fresh data.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setTiers(initialTiers.length ? initialTiers : [{ minTreatments: 8, discountPercent: 5 }]);
    setWasOpen(true);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const setField = (
    index: number,
    field: keyof LoyaltyTierInput,
    value: number,
  ) => {
    setTiers((current) =>
      current.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)),
    );
  };

  const valid =
    tiers.length > 0 &&
    tiers.every(
      (tier) =>
        tier.minTreatments >= 1 &&
        tier.discountPercent >= 0 &&
        tier.discountPercent <= 100,
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('loyaltyAdmin.editRulesTitle')}</DialogTitle>
          <DialogDescription>{t('loyaltyAdmin.editRulesDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {tiers.map((tier, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('loyaltyAdmin.tierMinLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={tier.minTreatments}
                  onChange={(e) =>
                    setField(index, 'minTreatments', Number(e.target.value))
                  }
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">
                  {t('loyaltyAdmin.tierPercentLabel')}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={tier.discountPercent}
                  onChange={(e) =>
                    setField(index, 'discountPercent', Number(e.target.value))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('loyaltyAdmin.removeTier')}
                onClick={() =>
                  setTiers((current) => current.filter((_, i) => i !== index))
                }
                disabled={tiers.length <= 1}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setTiers((current) => [
                ...current,
                {
                  minTreatments:
                    (current[current.length - 1]?.minTreatments ?? 4) + 4,
                  discountPercent:
                    (current[current.length - 1]?.discountPercent ?? 0) + 5,
                },
              ])
            }
          >
            <Plus className="mr-2 size-4" />
            {t('loyaltyAdmin.addTier')}
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!valid || updateTiers.isPending}
            onClick={() =>
              updateTiers.mutate(tiers, { onSuccess: () => onOpenChange(false) })
            }
          >
            {updateTiers.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('loyaltyAdmin.saveRules')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
