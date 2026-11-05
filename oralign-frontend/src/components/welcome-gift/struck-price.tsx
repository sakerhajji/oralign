'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';

/**
 * An original price the gift waives, struck through. Stays an <s> for
 * semantics, with an "Original price" prefix for screen readers (they
 * don't announce the strike).
 *
 * The prefix is `select-none` so a copy of the row yields "300 TND",
 * never "Original price300 TND", and it ends with a no-break space: an
 * sr-only box lays out on its own line, where a plain trailing space
 * collapses and glues the phrase to the amount for assistive tech too.
 * The amount comes formatted: the brand card and the dashboard surfaces
 * format money differently.
 */
export function StruckAmount({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <s
      className={cn(
        'whitespace-nowrap tabular-nums line-through decoration-current decoration-1',
        className,
      )}
    >
      <span className="sr-only select-none">
        {t('welcomeGift.dialog.originalPrice')}
        {'\u00A0'}
      </span>
      {value}
    </s>
  );
}
