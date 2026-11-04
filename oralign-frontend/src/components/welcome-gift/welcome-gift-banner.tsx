'use client';

import { useId } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { useWelcomeGiftStatus } from '@/lib/hooks/use-welcome-gift';
import { formatGiftAmount, splitAroundSlot } from './format';
import { giftFonts } from './fonts';
import { GIFT_STILL } from './welcome-gift-parts';
import styles from './welcome-gift.module.css';

/**
 * "Your (first) Oralign gift is waiting" — shown to a dentist who has
 * not used the gift yet while it is on and worth something; the copy
 * says "first case" to a new practitioner and "next case" to one who
 * already submitted cases (`status.firstCase`). The brand's black box:
 * text on ink at the start, the film still of the real box at the end.
 * Renders nothing while loading, on error, once the gifted case is in,
 * and for every other role (the status query is not even fired for them).
 */
export function WelcomeGiftBanner({
  showCta = true,
  className,
}: {
  /** Hide the CTA where the page already offers "New order". */
  showCta?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const { isDentist } = useAuth();
  const { data: status } = useWelcomeGiftStatus();
  const titleId = useId();

  if (!isDentist || !status?.eligible) return null;

  // First case keeps the owner's copy; a current practitioner gets the
  // "next case" variant (the value line is shared).
  const copy = status.firstCase ? 'welcomeGift.banner' : 'welcomeGift.banner.later';
  const total = formatGiftAmount(status.total, status.currency);
  const [valueBefore, valueAfter] = splitAroundSlot(
    (vars) => t('welcomeGift.banner.value', vars),
    'total',
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        styles.root,
        giftFonts,
        'overflow-hidden rounded-2xl bg-(--wg-ink) text-(--wg-porcelain)',
        className,
      )}
    >
      <div className="grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="order-2 flex flex-col items-start p-6 sm:p-8 md:order-1 lg:p-10">
          <h2
            id={titleId}
            className={cn(styles.display, 'max-w-[22ch] text-[26px] leading-[1.12] sm:text-[30px]')}
          >
            {t(`${copy}.title`)}
          </h2>
          <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.6] text-pretty text-(--wg-mute)">
            {status.cbctOffered
              ? t(`${copy}.bodyCbct`)
              : t(`${copy}.bodyTreatment`)}
          </p>
          <p className="mt-4 text-[16px] leading-[1.5] text-(--wg-mute)">
            {valueBefore}
            <span className="font-medium whitespace-nowrap text-(--wg-porcelain) tabular-nums">
              {total}
            </span>
            {valueAfter}
          </p>
          {status.cbctOffered && (
            <p className="mt-1.5 text-[14px] leading-[1.5] text-(--wg-mute)">
              {t(`${copy}.footnote`)}
            </p>
          )}
          {showCta && (
            <Link
              href="/dashboard/orders/new"
              className={cn(
                styles.action,
                'mt-7 inline-flex h-12 items-center rounded-full px-7 text-[16px] font-medium',
              )}
            >
              {t(`${copy}.cta`)}
            </Link>
          )}
        </div>

        <div className="relative order-1 aspect-[16/7] md:order-2 md:aspect-auto md:min-h-[260px]">
          <Image
            src={GIFT_STILL}
            alt=""
            fill
            sizes="(min-width: 768px) 42vw, 100vw"
            className="object-cover object-[50%_66%]"
          />
        </div>
      </div>
    </section>
  );
}
