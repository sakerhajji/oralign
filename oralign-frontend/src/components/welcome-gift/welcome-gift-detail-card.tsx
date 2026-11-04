'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { DentalOrder } from '@/lib/types';
import { formatGiftAmount } from './format';
import { giftFonts } from './fonts';
import { GiftLedger, LidMark, ledgerLines } from './welcome-gift-parts';
import styles from './welcome-gift.module.css';

/**
 * Order-detail state for a case whose fees the welcome gift waived — for
 * the doctor and the admin alike, with no pay action. Amounts are the
 * order's own snapshot (taken at submit), never the live settings. The
 * title says "welcome" only on the doctor's first case (`gift.firstCase`).
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

  return (
    <section
      className={cn(
        styles.root,
        giftFonts,
        'rounded-xl bg-(--wg-ink) p-5 text-(--wg-porcelain) sm:p-6',
        className,
      )}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
        <div className="flex min-w-0 items-start gap-4">
          <LidMark className="size-12" />
          <div className="min-w-0">
            <p className={cn(styles.display, 'text-[20px] leading-snug')}>
              {gift.firstCase
                ? t('welcomeGift.detail.title')
                : t('welcomeGift.detail.later.title')}
            </p>
            <p className="mt-1.5 max-w-[52ch] text-[14px] leading-[1.55] text-pretty text-(--wg-mute)">
              {withCbct
                ? t('welcomeGift.detail.textCbct')
                : t('welcomeGift.detail.textTreatment')}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <GiftLedger
            lines={ledgerLines(t, gift)}
            currency={gift.currency}
            size="sm"
            className="border-y border-(--wg-rule)"
          />
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <span className="text-[14px] text-(--wg-mute)">{t('welcomeGift.detail.total')}</span>
            <span className={cn(styles.figure, 'text-[24px] leading-none text-(--wg-porcelain)')}>
              {formatGiftAmount(gift.total, gift.currency)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
