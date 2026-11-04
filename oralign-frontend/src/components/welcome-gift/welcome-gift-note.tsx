'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { WelcomeGiftLines } from './format';
import { giftFonts } from './fonts';
import { GiftLedger, LidMark, StruckPrice, ledgerLines } from './welcome-gift-parts';
import styles from './welcome-gift.module.css';

/**
 * Compact note for the order wizard's review step: the fees this case
 * will NOT be charged, struck through, and the reassurance that no
 * payment will be requested. Same black-box language as the thank-you
 * card. Build `gift` with `giftLinesFromStatus` (live status) or from an
 * order's own snapshot.
 */
export function WelcomeGiftNote({
  gift,
  className,
}: {
  gift: WelcomeGiftLines;
  className?: string;
}) {
  const { t } = useT();

  return (
    <aside
      className={cn(
        styles.root,
        giftFonts,
        'max-w-md rounded-xl bg-(--wg-ink) p-5 text-(--wg-porcelain)',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <LidMark className="size-10" />
        <p className={cn(styles.display, 'text-[19px] leading-snug')}>
          {t('welcomeGift.note.title')}
        </p>
      </div>
      <GiftLedger
        lines={ledgerLines(t, gift)}
        currency={gift.currency}
        size="sm"
        className="mt-3 border-t border-(--wg-rule)"
      />
      <p className="mt-3 text-[14px] leading-[1.55] text-pretty text-(--wg-mute)">
        {t('welcomeGift.note.text')}
      </p>
    </aside>
  );
}

/**
 * One-line form of the note, for the wizard's files step: when the
 * practitioner requests CBCT on the gift case, the supplement is shown
 * struck and free instead of "added to the order total".
 */
export function WelcomeGiftFeeLine({
  label,
  amount,
  currency,
  className,
}: {
  label: string;
  amount: number;
  currency: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <p
      className={cn(
        styles.root,
        giftFonts,
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-(--wg-ink) px-3.5 py-2.5 text-[14px] text-(--wg-porcelain)',
        className,
      )}
    >
      <LidMark className="size-6" />
      <span className="font-medium">{t('welcomeGift.note.title')}</span>
      <span className="ms-auto flex items-baseline gap-3">
        <span className="text-(--wg-mute)">{label}</span>
        <StruckPrice amount={amount} currency={currency} className="text-(--wg-mute)" />
        <span className="font-medium">{t('welcomeGift.dialog.free')}</span>
      </span>
    </p>
  );
}
