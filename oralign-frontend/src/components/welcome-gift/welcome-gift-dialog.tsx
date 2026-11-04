'use client';

import Image from 'next/image';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { DentalOrder } from '@/lib/types';
import { formatGiftAmount } from './format';
import { giftFonts } from './fonts';
import { GIFT_STILL, GiftLedger, LidMark, ledgerLines } from './welcome-gift-parts';
import styles from './welcome-gift.module.css';

type Gift = NonNullable<DentalOrder['welcomeGift']>;

/**
 * The card a practitioner sees right after submitting the case the
 * welcome gift waived (their first case, or a current practitioner's
 * next one — `gift.firstCase` picks the copy). Built as the brand's black box:
 * the film still of the real box, porcelain type on ink, the waived lines
 * as a receipt, the total inside the lid's rings. One action ("Thank you,
 * Oralign"); Escape and the overlay also close it.
 */
export function WelcomeGiftDialog({
  open,
  onOpenChange,
  gift,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gift: Gift;
}) {
  const { t } = useT();
  const variant = gift.cbctFee > 0 ? 'cbct' : 'treatment';
  // First case keeps the owner's welcome copy; a later case thanks the
  // practitioner's loyalty (eyebrow, body, closing — the rest is shared).
  const copy = gift.firstCase ? 'welcomeGift.dialog' : 'welcomeGift.dialog.later';
  const total = formatGiftAmount(gift.total, gift.currency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Keep focus in the card without lighting the button's focus ring
        // for a pointer user; Tab still lands on the action first.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        tabIndex={-1}
        overlayClassName="bg-[#191919]/80 supports-backdrop-filter:backdrop-blur-none duration-300"
        className={cn(
          styles.root,
          giftFonts,
          'flex max-h-[92dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-(--wg-ink) p-0 text-(--wg-porcelain) ring-0 duration-300 outline-none sm:max-w-[520px] lg:max-w-[940px] lg:flex-row',
        )}
      >
        {/* The film still of the real box: a band on phones, the card's
            left side on desktop, cropped onto the lid. */}
        <div className="relative aspect-[16/5] shrink-0 overflow-hidden bg-(--wg-ink) sm:aspect-[16/7] lg:aspect-auto lg:w-[41%]">
          <Image
            src={GIFT_STILL}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 386px, (min-width: 640px) 520px, 100vw"
            className={cn(styles.photoSettle, 'object-cover object-[50%_68%] lg:object-[50%_58%]')}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Scrolls on short screens; the action stays put. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-1 sm:px-10 sm:pt-9 lg:px-12 lg:pt-11">
            <p className="text-[15px] text-(--wg-mute)">{t(`${copy}.eyebrow`)}</p>
            <DialogTitle
              className={cn(
                styles.display,
                'mt-1.5 text-[30px] leading-[1.08] text-(--wg-porcelain) sm:mt-2 sm:text-[40px]',
              )}
            >
              {t('welcomeGift.dialog.title')}
            </DialogTitle>
            <DialogDescription className="mt-3 max-w-[46ch] text-[15px] leading-[1.55] sm:mt-4 sm:text-[16px] sm:leading-[1.6] text-pretty text-(--wg-mute)">
              {t(`${copy}.${variant}.bodyBefore`)}{' '}
              <strong className="font-medium text-(--wg-porcelain)">
                {t(`${copy}.${variant}.bodyStrong`)}
              </strong>{' '}
              {t(`${copy}.${variant}.bodyAfter`)}
            </DialogDescription>

            <section className="mt-6 sm:mt-8" aria-labelledby="welcome-gift-privilege">
              <h3
                id="welcome-gift-privilege"
                className={cn(styles.display, 'text-[20px] leading-snug text-(--wg-porcelain)')}
              >
                {t(`${copy}.section`)}
              </h3>
              <GiftLedger
                lines={ledgerLines(t, gift)}
                currency={gift.currency}
                className="mt-2 border-b border-(--wg-rule)"
              />
              <TotalLine total={total} />
            </section>

            <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.55] text-(--wg-mute) italic sm:mt-6">
              {t(`${copy}.closing`)}
            </p>
          </div>

          <div className="shrink-0 px-6 pt-4 pb-5 sm:px-10 sm:pt-5 sm:pb-9 lg:px-12 lg:pb-11">
            <DialogClose asChild>
              <button
                type="button"
                className={cn(styles.action, 'h-14 w-full rounded-full text-[17px] font-medium')}
              >
                {t('welcomeGift.dialog.button')}
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Vous bénéficiez de {total} offerts." with the amount as the measured figure. */
function TotalLine({ total }: { total: string }) {
  const { t } = useT();
  const before = t('welcomeGift.dialog.totalBefore');
  const after = t('welcomeGift.dialog.totalAfter');
  return (
    <div className="mt-5 flex items-center justify-between gap-6 sm:mt-6">
      <p className="min-w-0">
        {before.trim() && (
          <span className="block text-[15px] text-(--wg-mute)">{before.trim()}</span>
        )}
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
          <span className={cn(styles.figure, 'text-[40px] leading-none text-(--wg-porcelain) sm:text-[52px]')}>
            {total}
          </span>
          {after.trim() && (
            <span className="text-[15px] text-(--wg-mute)">{after.trim()}</span>
          )}
        </span>
      </p>
      <LidMark draw className="size-16 sm:size-[88px]" />
    </div>
  );
}
