'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight progress bar — no radix dependency needed. Clamps the
 * value to [0, 100] and animates the inner fill width via a CSS
 * transition. Matches the shadcn visual treatment (rounded track +
 * accent fill).
 */
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({
  value = 0,
  className,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
