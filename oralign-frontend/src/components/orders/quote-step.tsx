'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { SectionCard } from '@/components/ui/section-card';
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
    <SectionCard
      title={title}
      titleSuffix={
        optionalLabel ? (
          <span className="text-xs font-normal text-muted-foreground">{optionalLabel}</span>
        ) : null
      }
      description={description}
      marker={step !== undefined ? <StepMarker step={step} done={done} /> : null}
      action={action}
      flush={flush}
      className={className}
    >
      {children}
    </SectionCard>
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
