'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A titled block of a long editing surface (quote steps, invoice form).
 *
 * Same shell as the app's cards — a hairline ring, no shadow — with one
 * header line: title, optional suffix (e.g. "optional"), one-line
 * description and a single right-aligned control.
 */
export function SectionCard({
  title,
  titleSuffix,
  description,
  marker,
  action,
  flush = false,
  className,
  children,
}: {
  title: string;
  /** Rendered next to the title, e.g. an "optional" hint. */
  titleSuffix?: ReactNode;
  description?: ReactNode;
  /** Small leading element, e.g. a step number. */
  marker?: ReactNode;
  /** Right-aligned header control. */
  action?: ReactNode;
  /** Let the body run edge to edge (tables). */
  flush?: boolean;
  className?: string;
  /** Omit for a header-only section (e.g. one waiting on a previous step). */
  children?: ReactNode;
}) {
  return (
    <section
      className={cn('rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10', className)}
    >
      <header
        className={cn(
          'flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-start',
          children ? 'pb-3' : 'pb-4',
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {marker}
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-6 font-semibold">
              {title}
              {titleSuffix}
            </h3>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children ? <div className={cn(flush ? 'pb-1' : 'px-5 pb-5')}>{children}</div> : null}
    </section>
  );
}
