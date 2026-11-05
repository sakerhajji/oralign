'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { formatGiftAmount } from './format';
import { StruckAmount } from './struck-price';
import styles from './welcome-gift.module.css';

/**
 * The brand film's still of the black ORALIGN box (dark stage, one warm
 * side light). Public assets are served immutable, so the hashed name is
 * the cache key — never edit the file in place.
 */
export const GIFT_STILL = '/showcase/hero/oralign-film-poster.b29a21bd.webp';

/*
 * The ORALIGN sun, from the logo (public/mainlogo.svg): the amber rays
 * and the smile arc beneath them. On ink the arc reverses to porcelain.
 */
const SUN_RAYS =
  'M182.68,66.16a60,60,0,0,1,30.51-8.38,61.59,61.59,0,0,1,31,8.38,59.63,59.63,0,0,1,30.4,47.21h39.33c0-.85,0-1.69,0-2.54,0-3.15-.16-6.4-.48-9.69H284.23l-.3-1.15a67.66,67.66,0,0,0-7.84-18.32l-.78-1.26L319.75,50.9a100.22,100.22,0,0,0-6.49-10.37l-45.49,30.2-1.17-1.22c-.45-.48-.9-1-1.37-1.42a73.73,73.73,0,0,0-14-10.94L250,56.41l16-30.86a99.72,99.72,0,0,0-10.8-5.73L238.8,51.35l-1.24-.41a75.65,75.65,0,0,0-16-3.36l-1.38-.15V.22a86.07,86.07,0,0,0-12.23,0V47.27l-1.41.11a70.51,70.51,0,0,0-16.84,3.41l-1.25.42-16.16-31.1a101.47,101.47,0,0,0-10.76,5.81L177.3,56.3l-1.25.74a70.18,70.18,0,0,0-15.77,12.63l-.88,1L113,40.53a99.46,99.46,0,0,0-6.44,10.39L152,80.41l-1.2,2c-.21.35-.43.69-.63,1A74.07,74.07,0,0,0,143.31,100l-.31,1.13H114.62c-.32,3.29-.48,6.54-.48,9.69,0,.85,0,1.69,0,2.54h38.26a61.55,61.55,0,0,1,7.73-24.62A60.47,60.47,0,0,1,182.68,66.16Z';
const SUN_ARC =
  'M213.72,192.5c20.18,0,37.53-7.12,51.56-21.17a69.79,69.79,0,0,0,20.45-41.07H274.07a61.17,61.17,0,0,1-7.23,21,59,59,0,0,1-22.43,22.41,62.23,62.23,0,0,1-31.22,8.18A59.34,59.34,0,0,1,170,164a58.7,58.7,0,0,1-17.15-33.77H141.16c2,15.7,8.88,29.54,20.56,41.16C175.78,185.41,193.27,192.5,213.72,192.5Z';

/**
 * The lid of the black box: concentric rings around the ORALIGN sun.
 * With `draw`, the outer ring is amber and draws itself once (the card's
 * one authored motion; complete at rest under reduced motion). Without
 * it, every ring is a quiet porcelain hairline. Decorative only.
 */
export function LidMark({
  draw = false,
  className,
}: {
  draw?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <g fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke">
        <circle cx={60} cy={60} r={30} stroke="rgb(242 245 239 / 0.42)" />
        <circle cx={60} cy={60} r={44} stroke="rgb(242 245 239 / 0.3)" />
        <circle
          cx={60}
          cy={60}
          r={58}
          pathLength={1}
          transform="rotate(-90 60 60)"
          stroke={draw ? 'var(--wg-amber)' : 'rgb(242 245 239 / 0.2)'}
          strokeWidth={draw ? 1.5 : 1}
          className={cn(styles.ring, draw && styles.ringDraw)}
        />
      </g>
      {/* Logo mark, 26 units wide, centred in the inner ring. */}
      <g transform="translate(46.6 48.3) scale(0.1215)">
        <path d={SUN_RAYS} fill="var(--wg-amber)" transform="translate(-104 0)" />
        <path d={SUN_ARC} fill="var(--wg-porcelain)" transform="translate(-104 0)" />
      </g>
    </svg>
  );
}

/**
 * Original price on the brand card, struck through ("300 TND": the
 * card's own amount format). Copy-safe and screen-reader friendly — see
 * StruckAmount.
 */
export function StruckPrice({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  return (
    <StruckAmount value={formatGiftAmount(amount, currency)} className={className} />
  );
}

export interface LedgerLine {
  key: string;
  label: string;
  amount: number;
}

/**
 * The waived lines, as on a receipt: what it was, its original price
 * struck, and "Free". Ink ground, porcelain text, rules between lines.
 */
export function GiftLedger({
  lines,
  currency,
  size = 'md',
  className,
}: {
  lines: LedgerLine[];
  currency: string;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const { t } = useT();
  return (
    <dl
      className={cn(
        'divide-y divide-(--wg-rule)',
        size === 'md' ? 'text-[16px]' : 'text-[15px]',
        className,
      )}
    >
      {lines.map((line) => (
        <div
          key={line.key}
          className={cn(
            'flex items-baseline justify-between gap-4',
            size === 'md' ? 'py-3 sm:py-3.5' : 'py-2.5',
          )}
        >
          <dt className="min-w-0 truncate text-(--wg-porcelain)">{line.label}</dt>
          <dd className="flex shrink-0 items-baseline gap-4">
            <StruckPrice
              amount={line.amount}
              currency={currency}
              className="text-(--wg-mute)"
            />
            <span className="min-w-[3.5rem] text-end font-medium text-(--wg-porcelain)">
              {t('welcomeGift.dialog.free')}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Waived lines in display order: CBCT (when waived), then treatment. */
export function ledgerLines(
  t: (path: string) => string,
  gift: { cbctFee: number; treatmentFee: number },
): LedgerLine[] {
  return [
    ...(gift.cbctFee > 0
      ? [{ key: 'cbct', label: t('welcomeGift.dialog.rowCbct'), amount: gift.cbctFee }]
      : []),
    {
      key: 'treatment',
      label: t('welcomeGift.dialog.rowTreatment'),
      amount: gift.treatmentFee,
    },
  ];
}
