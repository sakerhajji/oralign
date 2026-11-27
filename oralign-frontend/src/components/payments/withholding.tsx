'use client';

import { useEffect, useId } from 'react';
import { Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { BillingPublicDefaults } from '@/lib/api/company-billing.service';
import { extractApiError } from '@/lib/api/error';
import {
  paymentSplitOf,
  withholdingIneligibility,
  type PaymentChargePreview,
  type WithholdingRulePreview,
} from '@/lib/billing/tax-split';
import { useBillingPublicDefaults } from '@/lib/hooks';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { withholdingRefusalText } from '@/lib/payments/payment-refusals';
import type { Quotation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatAmount, formatPrice } from '@/lib/utils/currency';

/**
 * What a payment charges, as every payment screen shows it: the quote's
 * payment dialogs (practitioner card or transfer, admin card, admin cash
 * or cheque), the treatment-fee dialog and the payments lists. One
 * module, so the two kinds of payment never word or compute it
 * differently.
 *
 * Prices are TTC (TVA inside). Every payment gets its own facture, so the
 * droit de timbre is ADDED to every payment (owner decision 2026-11-20),
 * and the practitioner may keep `rate` % of the TTC (stamp excluded) as a
 * retenue à la source:
 *
 *     à payer = montant TTC + timbre - retenue
 *
 * The maths are the backend's mirror in lib/billing/tax-split, never
 * re-implemented here, and the server computes the real figures from the
 * choice alone. Every installment is its own payment, so a payment of
 * several installments sums the per-installment previews (one stamp and
 * one rounded retenue each) instead of taking them on the sum.
 *
 * The retenue is offered only when the rule lets it apply (spec §4): the
 * company switch is on, the rate is above 0, and each payment reaches the
 * threshold (TTC, stamp excluded). WithholdingChoice reads the rule itself
 * and unticks the choice when it stops applying, so no payment screen can
 * send a retenue the server would refuse (400 WITHHOLDING_DISABLED /
 * WITHHOLDING_BELOW_THRESHOLD).
 */

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Translate = ReturnType<typeof useT>['t'];

/**
 * "1", "1,5" (fr) / "1.5" (en): a rate as a person writes it. The
 * dictionary strings carry the "%" sign ("TVA ({rate} %)").
 */
export function formatRate(rate: number | string | null | undefined, lang: Lang): string {
  return num(rate).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 2,
  });
}

/** The retenue rule as the payment screens read it: numbers, never strings. */
export interface WithholdingRuleState extends Required<WithholdingRulePreview> {
  enabled: boolean;
  /** 0 when not configured. */
  rate: number;
  /** null = no threshold (none configured, or 0: every payment). */
  threshold: number | null;
}

/**
 * The retenue rule the public defaults describe: the switch (absent = off,
 * like the backend default), the rate and the threshold (null = none).
 */
export function withholdingRuleOf(
  data: Pick<BillingPublicDefaults, 'withholdingRate' | 'withholdingEnabled' | 'withholdingThreshold'> | null | undefined,
): WithholdingRuleState {
  const rate = Number(data?.withholdingRate ?? 0);
  const threshold = data?.withholdingThreshold;
  return {
    enabled: data?.withholdingEnabled === true,
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0 ? threshold : null,
  };
}

/**
 * The company's retenue rule, for screens that show whether it applies
 * (WithholdingChoice, a devis' "retenue si appliquée"). `ready` is false
 * until the defaults answered (or failed: the rule then reads as off).
 */
export function useWithholdingRule(enabled = true) {
  const { data, isError } = useBillingPublicDefaults(enabled);
  return { rule: withholdingRuleOf(data), ready: !!data || isError };
}

/**
 * Rates that drive the quote's price wording, the stamp and the retenue
 * option: the quote's own TVA rate when it has one, otherwise the company
 * default (old pack quotes were stored at 0 % although their price
 * includes TVA). `withholdingRate` is the rate in force: 0 while the
 * retenue is switched off, so a screen that offers it on `rate > 0` never
 * offers it then. The threshold is applied by WithholdingChoice.
 */
export function useQuoteTaxRates(
  quote: Pick<Quotation, 'tvaRate'> | null | undefined,
  enabled = true,
) {
  const { data, isError } = useBillingPublicDefaults(enabled);
  const own = Number(quote?.tvaRate ?? 0);
  const tvaRate = own > 0 ? own : Number(data?.defaultTvaRate ?? 0);
  const rule = withholdingRuleOf(data);
  return {
    tvaRate: Number.isFinite(tvaRate) ? tvaRate : 0,
    /** Droit de timbre added to each payment; 0 = none. */
    stampDuty: Math.max(0, Number(data?.stampDuty ?? 0) || 0),
    /** The retenue rate in force; 0 when switched off or not configured. */
    withholdingRate: rule.enabled ? rule.rate : 0,
    /** The company switch of the retenue (spec §4). */
    withholdingEnabled: rule.enabled,
    /** Base (TTC, stamp excluded) a payment must reach; null = none. */
    withholdingThreshold: rule.threshold,
    /** False until the defaults answered (or failed). */
    ready: !!data || isError,
  };
}

export type QuoteTaxRates = ReturnType<typeof useQuoteTaxRates>;

/**
 * 409 from a card session: a live attempt for the same amount carries the
 * other retenue choice. Only this refusal gets the "finish it or wait for
 * it to expire" explanation; the PAYMENT_ATTEMPT_IN_PROGRESS cases (a
 * transfer awaiting confirmation, a card already in flight) are toasted
 * by the mutation hooks, in the user's language
 * (lib/payments/payment-refusals.ts).
 */
export const WITHHOLDING_CHOICE_CONFLICT = 'WITHHOLDING_CHOICE_CONFLICT';

export function isWithholdingChoiceConflict(error: unknown): boolean {
  return extractApiError(error).errorCode === WITHHOLDING_CHOICE_CONFLICT;
}

/**
 * The user's-language copy of a retenue refusal (400 WITHHOLDING_DISABLED
 * / WITHHOLDING_BELOW_THRESHOLD, the threshold formatted when the body
 * carries it); null for any other error, which keeps its own message.
 * The mapping is lib/payments/payment-refusals.ts, shared with the payment
 * hooks, which toast it.
 */
export function withholdingErrorCopy(
  error: unknown,
  t: Translate,
  currency?: string | null,
): string | null {
  const body = (error as { response?: { data?: unknown } } | null)?.response?.data;
  return withholdingRefusalText(extractApiError(error).errorCode, body, t, (value) =>
    formatPrice(value, currency),
  );
}

/** What the amount settles: an installment, several, or a treatment fee. */
export type ChargeKind = 'installment' | 'installments' | 'fee';

/** A recorded payment's split: what it settles, the stamp, the retenue, the cash. */
export interface RecordedSplit {
  /** What it settles: the installment or the fee (+ CBCT), TTC. */
  due: number;
  /** Droit de timbre charged on top (0 on payments made before 2026-11-20). */
  stamp: number;
  withheld: number;
  /** What came in. */
  cash: number;
  /** The rate snapshotted on the payment; null when the row carries none. */
  rate: number | null;
}

/**
 * The split of a payment or a fee as the API returns it (`amount` = cash:
 * due + stamp - retenue). null when neither a stamp nor a retenue applies
 * (older rows), so callers keep their plain one-figure layout.
 */
export function recordedSplit(
  cash: number | string | null | undefined,
  withheld: number | string | null | undefined,
  rate?: number | string | null,
  stamp?: number | string | null,
  settled?: number | string | null,
): RecordedSplit | null {
  const split = paymentSplitOf(cash, withheld, stamp, settled);
  if (split.withholding <= 0 && split.stamp <= 0) return null;
  return {
    due: split.settled,
    stamp: split.stamp,
    withheld: split.withholding,
    cash: split.cash,
    rate: split.withholding <= 0 || rate == null || num(rate) <= 0 ? null : num(rate),
  };
}

/**
 * "Échéance 1 000,000 TND", "Timbre 1,000 TND", "Retenue 10,000 TND": the
 * short parts of a recorded split, for a phone row's meta line.
 */
export function recordedSplitParts(
  split: RecordedSplit | null,
  currency: string | null | undefined,
  t: Translate,
  kind: 'installment' | 'fee' = 'installment',
): string[] {
  if (!split) return [];
  const money = (value: number) => formatPrice(value, currency);
  return [
    t(kind === 'fee' ? 'withholdingUi.dueShortFee' : 'withholdingUi.dueShortInstallment', {
      amount: money(split.due),
    }),
    split.stamp > 0 ? t('withholdingUi.stampShort', { amount: money(split.stamp) }) : null,
    split.withheld > 0 ? t('withholdingUi.withheldShort', { amount: money(split.withheld) }) : null,
  ].filter((part): part is string => !!part);
}

/**
 * An amount cell of a payments list: the cash received, and under it,
 * when a stamp or a retenue applies, what it settles, the stamp and the
 * retenue (no currency, the column's figure carries it). The full
 * sentence is the hover text.
 */
export function AmountWithWithholding({
  cash,
  split,
  currency,
  kind = 'installment',
  className,
}: {
  cash: number | string | null | undefined;
  split: RecordedSplit | null;
  currency: string | null | undefined;
  kind?: 'installment' | 'fee';
  className?: string;
}) {
  const { t } = useT();
  if (!split) return <span className={className}>{formatPrice(cash, currency)}</span>;
  const title = [
    ...recordedSplitParts(split, currency, t, kind),
    t('withholdingUi.receivedShort', { amount: formatPrice(split.cash, currency) }),
  ].join(' · ');
  return (
    <span className={cn('inline-flex flex-col', className)} title={title}>
      <span>{formatPrice(split.cash, currency)}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {t(kind === 'fee' ? 'withholdingUi.dueShortFee' : 'withholdingUi.dueShortInstallment', {
          amount: formatAmount(split.due),
        })}
      </span>
      {split.stamp > 0 ? (
        <span className="text-xs font-normal text-muted-foreground">
          {t('withholdingUi.stampShort', { amount: formatAmount(split.stamp) })}
        </span>
      ) : null}
      {split.withheld > 0 ? (
        <span className="text-xs font-normal text-muted-foreground">
          {t('withholdingUi.withheldShort', { amount: formatAmount(split.withheld) })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A recorded payment's breakdown, in full: échéance (or honoraires) TTC,
 * droit de timbre, retenue, encaissé. Used where an admin checks a
 * payment before confirming it, and on a payment's result page.
 */
export function RecordedPaymentBreakdown({
  split,
  currency,
  kind = 'installment',
  cashLabel,
  className,
}: {
  split: RecordedSplit;
  currency: string | null | undefined;
  kind?: 'installment' | 'fee';
  /** Last line's label; "Encaissé" by default. */
  cashLabel?: string;
  className?: string;
}) {
  const { t, lang } = useT();
  const money = (value: number) => formatPrice(value, currency);
  return (
    <dl className={cn('space-y-1.5 rounded-lg border p-3 text-sm', className)}>
      <BreakdownRow
        label={t(kind === 'fee' ? 'withholdingUi.dueFee' : 'withholdingUi.dueInstallment')}
        value={money(split.due)}
      />
      {split.stamp > 0 ? (
        <BreakdownRow label={t('withholdingUi.stamp')} value={`+ ${money(split.stamp)}`} />
      ) : null}
      {split.withheld > 0 ? (
        <BreakdownRow
          label={
            split.rate !== null
              ? t('withholdingUi.withheld', { rate: formatRate(split.rate, lang) })
              : t('withholdingUi.withheldNoRate')
          }
          value={`− ${money(split.withheld)}`}
        />
      ) : null}
      <BreakdownRow
        label={cashLabel ?? t('withholdingUi.received')}
        value={money(split.cash)}
        strong
      />
    </dl>
  );
}

/**
 * "Prix TTC : TVA 19 % incluse. Droit de timbre 1,000 TND ajouté à chaque
 * paiement.", where a price is announced. The line keeps its height while
 * the rates load (rate 0), so nothing below it moves when they land.
 */
export function PriceIncludesTaxNote({
  tvaRate,
  stamp,
  currency,
  className,
}: {
  tvaRate: number | string | null | undefined;
  /** The stamp added to each payment; 0 = none. */
  stamp: number | string | null | undefined;
  currency?: string | null;
  className?: string;
}) {
  const { t, lang } = useT();
  const rate = num(tvaRate);
  const text =
    rate > 0
      ? num(stamp) > 0
        ? t('withholdingUi.ttcNote', {
            rate: formatRate(rate, lang),
            stamp: formatPrice(num(stamp), currency),
          })
        : t('withholdingUi.ttcNoteNoStamp', { rate: formatRate(rate, lang) })
      : '';
  return (
    <p className={cn('min-h-4 text-xs leading-4 text-muted-foreground', className)}>{text}</p>
  );
}

/** One amount line above the stamp (the fee and its CBCT supplement). */
export interface DueLine {
  label: string;
  amount: number;
}

/**
 * The payment's breakdown and, when the company offers it, the
 * practitioner's retenue choice: one checkbox "Appliquer la retenue à la
 * source (1 %)" above the live rows (amount due TTC, droit de timbre,
 * retenue when ticked, to pay). Without the option (switched off, rate 0,
 * or a method the practitioner doesn't pay himself) only the rows show.
 *
 * Eligibility (spec §4) is read here, from the company rule: the payment
 * (each one, for several installments: `charge.smallestDue`) must reach
 * the threshold. Below it the checkbox gives way to a one-line note, and
 * a ticked choice that stops applying (another scope, a new rule) is
 * unticked through `onCheckedChange(false)`, so the caller never sends a
 * retenue the server would refuse.
 */
export function WithholdingChoice({
  rate,
  offer = true,
  checked,
  onCheckedChange,
  currency,
  charge,
  kind = 'installment',
  dueLines,
  disabled,
  audience,
  netLabel,
  className,
}: {
  /** The company rate (%) from the billing settings; 0 = off. */
  rate: number | null | undefined;
  /** False hides the checkbox (the rows stay). */
  offer?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  currency: string;
  /**
   * What the payment charges (previewPaymentCharge, or
   * previewInstallmentCharges for several installments, whose `count`
   * gives the number of stamps and `smallestDue` the payment the
   * threshold is checked on).
   */
  charge: PaymentChargePreview & { count?: number; smallestDue?: number };
  /** Labels the amount due: an installment, several, or a treatment fee. */
  kind?: ChargeKind;
  /** The amount due in parts (fee + CBCT); replaces the single due line. */
  dueLines?: DueLine[];
  disabled?: boolean;
  /**
   * Adds the line that explains the choice to whoever ticks it: the
   * payer ("vous retenez…") or an admin recording it. None by default.
   */
  audience?: 'payer' | 'admin';
  /** Last line's label; "À payer" by default. */
  netLabel?: string;
  className?: string;
}) {
  const { t, lang } = useT();
  const id = useId();
  const { rule, ready } = useWithholdingRule();
  const count = Math.max(1, charge.count ?? 1);
  // Each installment is its own payment: the smallest one must qualify.
  const base = charge.smallestDue ?? charge.due;
  const ineligible = ready
    ? withholdingIneligibility(base, { enabled: rule.enabled, rate, threshold: rule.threshold })
    : 'disabled';
  const offered = offer && ineligible === null;
  const belowThreshold =
    offer && ready && ineligible === 'below_threshold' && charge.due > 0 && rule.threshold !== null;
  // A ticked retenue that no longer applies is unticked, once the rule is
  // known (a choice restored before the defaults load is kept until then).
  useEffect(() => {
    if (ready && checked && ineligible !== null) onCheckedChange(false);
  }, [ready, checked, ineligible, onCheckedChange]);
  const rateLabel = formatRate(rate, lang);
  const money = (value: number) => formatPrice(value, currency);
  const help =
    offered && audience
      ? t(audience === 'admin' ? 'withholdingUi.helpAdmin' : 'withholdingUi.helpPayer', {
          rate: rateLabel,
        })
      : null;
  const stampEach = Math.round((charge.stamp * 1000) / count) / 1000;
  const dueLabel = t(
    kind === 'fee'
      ? 'withholdingUi.dueFee'
      : kind === 'installments' && count > 1
        ? 'withholdingUi.dueInstallments'
        : 'withholdingUi.dueInstallment',
  );

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      {offered ? (
        <div className={cn('flex gap-3 border-b px-3', help ? 'items-start' : 'items-center')}>
          {/* The label is the whole row: a ≥ 44 px target on a phone. */}
          <Checkbox
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(next) => onCheckedChange(next === true)}
            // On the first line of the label when a help line follows.
            className={help ? 'mt-[10px]' : undefined}
            aria-describedby={help ? `${id}-help` : undefined}
          />
          <label
            htmlFor={id}
            className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center py-2"
          >
            <span className="text-sm leading-snug font-medium">
              {t('withholdingUi.apply', { rate: rateLabel })}
            </span>
            {help ? (
              <span
                id={`${id}-help`}
                className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
              >
                {help}
              </span>
            ) : null}
          </label>
        </div>
      ) : belowThreshold ? (
        <p className="flex items-start gap-2 border-b px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t(
              count > 1
                ? 'withholdingRules.hint.belowThresholdEach'
                : 'withholdingRules.hint.belowThreshold',
              { threshold: money(rule.threshold ?? 0) },
            )}
          </span>
        </p>
      ) : null}
      <dl className="space-y-1.5 px-3 py-3 text-sm" aria-live="polite">
        {dueLines && dueLines.length > 0 ? (
          dueLines.map((line) => (
            <BreakdownRow key={line.label} label={line.label} value={money(line.amount)} />
          ))
        ) : (
          <BreakdownRow label={dueLabel} value={money(charge.due)} />
        )}
        {charge.stamp > 0 ? (
          <BreakdownRow
            label={
              count > 1
                ? t('withholdingUi.stampTimes', { count, stamp: formatAmount(stampEach) })
                : t('withholdingUi.stamp')
            }
            value={`+ ${money(charge.stamp)}`}
          />
        ) : null}
        {offered && checked && charge.withholding > 0 ? (
          <BreakdownRow
            label={t('withholdingUi.withheld', { rate: rateLabel })}
            value={`− ${money(charge.withholding)}`}
          />
        ) : null}
        <BreakdownRow
          label={netLabel ?? t('withholdingUi.toPay')}
          value={money(charge.cash)}
          strong
        />
      </dl>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-3',
        strong && 'border-t pt-1.5 font-semibold',
      )}
    >
      <dt className={cn('min-w-0', !strong && 'text-muted-foreground')}>{label}</dt>
      <dd className="ml-auto tabular-nums">{value}</dd>
    </div>
  );
}
