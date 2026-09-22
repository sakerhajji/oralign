'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One numbered section of the admin quote editor (Pack → Adjustments →
 * Payment). The marker turns into a check once the step is complete, so
 * the page reads as a short checklist rather than a stack of cards.
 */
export function QuoteStep({
  step,
  title,
  description,
  done = false,
  optionalLabel,
  action,
  flush = false,
  className,
  children,
}: {
  /** Omit for unnumbered sections (e.g. notes). */
  step?: number;
  title: string;
  description?: ReactNode;
  done?: boolean;
  /** Shown next to the title for steps that can be skipped. */
  optionalLabel?: string;
  /** Right-aligned header control, e.g. an "Edit" button. */
  action?: ReactNode;
  /** Let the body run edge to edge (tables). */
  flush?: boolean;
  className?: string;
  /** Omit for a header-only step (e.g. one waiting on a previous step). */
  children?: ReactNode;
}) {
  return (
    <section
      className={cn('rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10', className)}
    >
      <header className={cn('flex items-start gap-3 px-5 pt-4', children ? 'pb-3' : 'pb-4')}>
        {step !== undefined ? <StepMarker step={step} done={done} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-6 font-semibold">
            {title}
            {optionalLabel ? (
              <span className="text-xs font-normal text-muted-foreground">{optionalLabel}</span>
            ) : null}
          </h3>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children ? <div className={cn(flush ? 'pb-1' : 'px-5 pb-5')}>{children}</div> : null}
    </section>
  );
}

function StepMarker({ step, done }: { step: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
        done ? 'bg-foreground text-background' : 'border border-foreground/25 text-muted-foreground',
      )}
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : step}
    </span>
  );
}
