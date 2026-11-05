'use client';

import { Gift } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import { splitAroundSlot, type WelcomeGiftLines } from './format';
import { StruckAmount } from './struck-price';

/**
 * The order wizard's review-step summary for a case under the Oralign
 * gift. Same block as the regular price summary next to it (muted panel,
 * label / amount rows, total under a rule), so the gift reads as part of
 * the dashboard: each waived fee struck with an "Offert" badge, then
 * "Amount due: 0". The title says "welcome" only on the practitioner's
 * first case. Build `gift` with `giftLinesFromStatus` (live status) or
 * from an order's own snapshot.
 */
export function WelcomeGiftNote({
  gift,
  className,
}: {
  gift: WelcomeGiftLines;
  className?: string;
}) {
  const { t } = useT();
  const rows = [
    { key: 'treatment', label: t('orderForm.review.priceBase'), amount: gift.treatmentFee },
    ...(gift.cbctFee > 0
      ? [{ key: 'cbct', label: t('orderForm.review.priceCbct'), amount: gift.cbctFee }]
      : []),
  ];

  return (
    // One step wider than the plain summary: each row also holds a badge.
    <div className={cn('max-w-md rounded-lg border bg-muted/20 p-3 text-sm', className)}>
      <div className="flex items-center gap-2">
        <GiftChip />
        <p className="font-semibold">
          {gift.firstCase ? t('welcomeGift.note.title') : t('welcomeGift.note.later.title')}
        </p>
      </div>
      <dl className="mt-2.5 space-y-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
            <dd className="flex shrink-0 items-center gap-2">
              <StruckAmount
                value={formatPrice(row.amount, gift.currency)}
                className="text-muted-foreground"
              />
              <FreeBadge />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t pt-1.5">
          <dt className="font-semibold">{t('welcomeGift.note.due')}</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(0, gift.currency)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t('welcomeGift.note.text')}
      </p>
    </div>
  );
}

/**
 * The files-step notice when CBCT is requested on the gift case: the
 * paid-supplement notice's shape, in emerald, with the supplement struck
 * instead of "added to the order total".
 */
export function WelcomeGiftFeeLine({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  const { t } = useT();
  const [before, after] = splitAroundSlot(
    (vars) => t('welcomeGift.feeLine.text', vars),
    'price',
  );
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
        className,
      )}
    >
      <Gift className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {before}
        <StruckAmount value={formatPrice(amount, currency)} />
        {after}
      </span>
    </p>
  );
}

/** Small emerald icon chip, as on the dashboard's positive states. */
export function GiftChip({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
        className,
      )}
    >
      <Gift className="size-3.5" />
    </span>
  );
}

/** The emerald "Free" badge next to a struck fee. */
export function FreeBadge({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400',
        className,
      )}
    >
      {t('welcomeGift.dialog.free')}
    </Badge>
  );
}
