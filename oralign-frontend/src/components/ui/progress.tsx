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

/**
 * Indeterminate companion to <Progress/> — a sweeping segment for phases
 * whose length is unknowable (parsing a mesh, decoding, waiting on a
 * server that sends no Content-Length). Same track/fill treatment so a
 * bar can switch between determinate and indeterminate without a jump.
 * The keyframe is co-located (not in globals.css) so the component is
 * self-contained; the style tag is deduped by the browser per document.
 */
export function IndeterminateBar({
  className,
  ...props
}: Omit<ProgressProps, 'value'>) {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    >
      <style>{`@keyframes ui-indeterminate-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style>
      <div
        className="h-full w-2/5 rounded-full bg-primary"
        style={{
          animation: 'ui-indeterminate-sweep 1.2s ease-in-out infinite',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
