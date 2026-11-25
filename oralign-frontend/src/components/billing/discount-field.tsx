'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { DecimalInput } from '@/components/ui/decimal-input';
import { useT } from '@/lib/i18n/lang-context';
import { formatPrice } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';

/** How the admin types a remise: an amount, or a percentage of the gross. */
export type DiscountMode = 'amount' | 'percent';

/**
 * The « Remise » input of the devis editor and of the invoice form: one
 * field, switched between an amount (in the currency) and a percentage of
 * the gross. In percentage mode the amount it stands for is shown under
 * it; the server derives the same amount and keeps the percentage, so the
 * document prints « Remise (10 %) ».
 */
export function DiscountField({
  label,
  currency,
  mode,
  amount,
  percent,
  percentAmount,
  onModeChange,
  onAmountChange,
  onPercentChange,
  disabled,
  inputClassName,
}: {
  label: string;
  currency: string;
  mode: DiscountMode;
  amount: number;
  percent: number;
  /** The amount the percentage stands for (preview). */
  percentAmount: number;
  onModeChange: (mode: DiscountMode) => void;
  onAmountChange: (amount: number) => void;
  onPercentChange: (percent: number) => void;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const { t } = useT();
  const id = useId();
  const isPercent = mode === 'percent';
  const option = (value: DiscountMode, text: string, aria: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      aria-label={aria}
      disabled={disabled}
      onClick={() => onModeChange(value)}
      className={cn(
        'min-h-9 min-w-11 rounded px-2 text-xs font-medium tabular-nums transition-colors sm:min-h-7 sm:min-w-9',
        mode === value
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="grid content-start gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div
          role="radiogroup"
          aria-label={t('discountField.mode')}
          className="inline-flex shrink-0 rounded-md border bg-muted/40 p-0.5"
        >
          {option('amount', currency, t('discountField.inAmount'))}
          {option('percent', '%', t('discountField.inPercent'))}
        </div>
      </div>
      <div className="relative">
        <DecimalInput
          // A fresh input per mode: the typed text never carries over.
          key={mode}
          id={id}
          value={isPercent ? percent : amount}
          onValueChange={(value) =>
            isPercent ? onPercentChange(Math.min(100, value)) : onAmountChange(value)
          }
          fractionDigits={isPercent ? 2 : 3}
          // Typing replaces the value instead of appending to a "0".
          onFocus={(event) => event.currentTarget.select()}
          disabled={disabled}
          className={cn('pr-12 tabular-nums', inputClassName)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {isPercent ? '%' : currency}
        </span>
      </div>
      {isPercent ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('discountField.equals', { amount: formatPrice(percentAmount, currency) })}
        </p>
      ) : null}
    </div>
  );
}

/** "Remise (10 %)" when typed as a percentage, the plain label otherwise. */
export function discountLabel(
  label: string,
  mode: DiscountMode,
  percent: number,
  lang: string,
): string {
  if (mode !== 'percent' || !(percent > 0)) return label;
  const text = Number(percent.toFixed(2)).toString();
  return `${label} (${lang === 'fr' ? text.replace('.', ',') : text} %)`;
}
