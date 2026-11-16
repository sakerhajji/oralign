'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { orderKindLabelKey, type OrderKindRef } from '@/lib/orders/order-navigation';
import { cn } from '@/lib/utils';

/**
 * Names the kind of a supplemental child ("Aligner replacement"…) wherever
 * order rows are listed, so it never reads as a new case. Renders nothing
 * for an initial order: the case is the default and needs no label.
 */
export function OrderKindBadge({
  order,
  className,
}: {
  order: Pick<OrderKindRef, 'orderType'>;
  className?: string;
}) {
  const { t } = useT();
  const labelKey = orderKindLabelKey(order);
  if (!labelKey) return null;
  return (
    <Badge
      variant="outline"
      // Shrinkable (the base badge is not) so a long kind truncates
      // instead of pushing the order code or status out of a phone row.
      className={cn(
        'min-w-0 max-w-full shrink bg-background text-[11px] font-medium',
        className,
      )}
    >
      <span className="truncate">{t(labelKey)}</span>
    </Badge>
  );
}
