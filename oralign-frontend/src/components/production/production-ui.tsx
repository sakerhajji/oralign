'use client';

import type { ReactNode, Ref } from 'react';
import Link from 'next/link';
import { ChevronLeft, Factory } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { OrderType } from '@/lib/types';
import type { ProductionOrderSummary } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { STATUS_TONE, productionStatusOf } from './production-format';

/**
 * The building blocks every technician screen shares: the page frame,
 * the back link, the in-block message, the kind and status badges.
 */

export function ProductionFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      {/* Bottom room on phones: nothing may sit under the thumb's last row. */}
      <div
        className={cn(
          'mx-auto flex w-full min-w-0 flex-col gap-4 px-4 pt-4 pb-24 md:gap-5 md:pt-6 md:pb-10 lg:px-6',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** "‹ File de production": a 48 px target for a finger, compact for a mouse from md up. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-12 w-fit items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-fine:md:h-9"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** An empty or failed block: keeps the block's frame, one sentence, one action. */
export function ProductionMessage({
  icon,
  title,
  detail,
  action,
  role,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10"
    >
      <span className="text-muted-foreground [&>svg]:size-6" aria-hidden="true">
        {icon ?? <Factory />}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="max-w-md text-sm text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProductionNoAccess() {
  const { t } = useT();
  return (
    <ProductionFrame className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('production.title')}</h1>
      <ProductionMessage title={t('production.access.title')} detail={t('production.access.body')} />
    </ProductionFrame>
  );
}

/** Names a supplemental child's kind; nothing for an initial case. */
export function ProductionKindBadge({
  orderType,
  className,
}: {
  orderType: OrderType;
  className?: string;
}) {
  const { t } = useT();
  if (orderType === OrderType.INITIAL) return null;
  return (
    <Badge
      variant="outline"
      className={cn('min-w-0 max-w-full shrink bg-background text-[11px] font-medium', className)}
    >
      <span className="truncate">{t(`production.kinds.${orderType}`)}</span>
    </Badge>
  );
}

export function ProductionStatusBadge({
  item,
  className,
}: {
  item: Pick<ProductionOrderSummary, 'status' | 'deliveryComplete' | 'counters'>;
  className?: string;
}) {
  const { t } = useT();
  const key = productionStatusOf(item);
  return (
    <Badge variant="secondary" className={cn(STATUS_TONE[key], className)}>
      {t(`production.status.${key}`)}
    </Badge>
  );
}

/** A titled card of the case sheet and the dossier. */
export function ProductionSection({
  title,
  action,
  children,
  className,
  bodyClassName,
  id,
  headingRef,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  /** Makes the heading a focus target (tabIndex -1) for code to move focus to. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={cn('rounded-xl bg-card ring-1 ring-foreground/10', className)}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={headingRef ? -1 : undefined}
          className="text-sm font-semibold outline-none"
        >
          {title}
        </h2>
        {action}
      </header>
      <div className={cn('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** A label over a value; an absent value is a grey dash. */
export function Fact({
  label,
  children,
  wide,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  const empty =
    children === null ||
    children === undefined ||
    children === false ||
    (typeof children === 'string' && children.trim() === '');
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2 lg:col-span-3')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium wrap-anywhere whitespace-pre-wrap">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}
