'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { PhoneInputProps, PhoneInputSize } from '@/components/ui/phone-input';

/*
 * The phone field of the patient forms (patients sheet, order wizard's
 * inline new patient), loaded on demand: react-phone-input-2 ships its
 * country data and a 45 KB flag sprite, which must not weigh on the
 * patients list or the wizard's first load.
 */
const PhoneInput = dynamic(
  () => import('@/components/ui/phone-input').then((mod) => mod.PhoneInput),
  {
    ssr: false,
    // Fills the sized wrapper below, so nothing moves when the field lands.
    loading: () => (
      <div
        aria-hidden
        className="h-full w-full animate-pulse rounded-lg border border-input bg-muted/40"
      />
    ),
  },
);

/** Same heights as PhoneInput's sizes (the wrapper holds the space). */
const HEIGHT: Record<PhoneInputSize, string> = {
  sm: 'h-8',
  default: 'h-10',
  lg: 'h-11',
};

/**
 * PhoneInput defaulting to Tunisia and emitting E.164 (`+21622123456`,
 * or '' when only the dial code is there). `ref` reaches the real
 * <input> once loaded, so react-hook-form can focus it.
 */
export function PatientPhoneInput({
  size = 'default',
  className,
  ...props
}: PhoneInputProps) {
  return (
    <div className={cn('relative', HEIGHT[size], className)}>
      <PhoneInput size={size} {...props} />
    </div>
  );
}
