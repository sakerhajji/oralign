'use client';

import { Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import type { DentalOrder } from '@/lib/types';
import { StruckAmount } from './struck-price';

/**
 * Order-detail state for a case whose fees the Oralign gift waived — for
 * the doctor and the admin alike, with no pay action. A light tinted
 * card like the sibling fee states (paid, awaiting confirmation,
 * awaiting payment): what was waived on the left, the struck amounts
 * and the total covered on the right. Amounts are the order's own
 * snapshot (taken at submit), never the live settings. The title says
 * "welcome" only on the doctor's first case (`gift.firstCase`).
 */
export function WelcomeGiftDetailCard({
  gift,
  className,
}: {
  gift: NonNullable<DentalOrder['welcomeGift']>;
  className?: string;
}) {
  const { t } = useT();
  const withCbct = gift.cbctFee > 0;
  const rows = [
    { key: 'treatment', label: t('orderForm.review.priceBase'), amount: gift.treatmentFee },
    ...(withCbct
      ? [{ key: 'cbct', label: t('orderForm.review.priceCbct'), amount: gift.cbctFee }]
      : []),
  ];

  return (
    <Card className={cn('border-emerald-200 bg-emerald-50', className)}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <Gift className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              {gift.firstCase
                ? t('welcomeGift.detail.title')
                : t('welcomeGift.detail.later.title')}
            </p>
            <p className="text-xs text-emerald-800/80">
              {withCbct
                ? t('welcomeGift.detail.textCbct')
                : t('welcomeGift.detail.textTreatment')}
            </p>
          </div>
        </div>

        <dl className="grid shrink-0 gap-1 border-t border-emerald-200 pt-3 text-xs sm:min-w-60 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <dt className="text-emerald-800/80">{row.label}</dt>
              <dd>
                <StruckAmount
                  value={formatPrice(row.amount, gift.currency)}
                  className="text-emerald-800/70"
                />
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-emerald-900">{t('welcomeGift.detail.total')}</dt>
            <dd className="text-sm font-semibold text-emerald-900 tabular-nums">
              {formatPrice(gift.total, gift.currency)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
