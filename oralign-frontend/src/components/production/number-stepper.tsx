'use client';

import { forwardRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

/** The integer a stepper's text holds, or null while it is not one. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/**
 * A big − [ 12 ] + control for a gloved hand: 48 px buttons, a numeric
 * keypad on phones, the whole number selected on focus so typing
 * replaces it. The text is the parent's (a half-typed value stays as
 * typed); the buttons step from the last valid number.
 */
export const NumberStepper = forwardRef<
  HTMLInputElement,
  {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    min: number;
    max: number;
    invalid?: boolean;
    describedBy?: string;
    className?: string;
  }
>(function NumberStepper(
  { id, label, value, onChange, min, max, invalid, describedBy, className },
  ref,
) {
  const { t } = useT();
  const current = parseCount(value);
  const step = (delta: number) => {
    const base = current ?? min;
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };
  return (
    <div className={cn('flex items-stretch gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        className="size-12 shrink-0 rounded-xl [&_svg:not([class*='size-'])]:size-5"
        onClick={() => step(-1)}
        disabled={current !== null && current <= min}
        aria-label={t('production.form.decrease', { field: label })}
        aria-controls={id}
      >
        <Minus aria-hidden="true" />
      </Button>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
        onFocus={(event) => event.currentTarget.select()}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-12 w-full min-w-0 flex-1 rounded-xl border border-input bg-background px-1 text-center text-2xl font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
      />
      <Button
        type="button"
        variant="outline"
        className="size-12 shrink-0 rounded-xl [&_svg:not([class*='size-'])]:size-5"
        onClick={() => step(1)}
        disabled={current !== null && current >= max}
        aria-label={t('production.form.increase', { field: label })}
        aria-controls={id}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
});
