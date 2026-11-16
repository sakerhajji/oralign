'use client';

import { TextInput } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { parseWholeNumber } from '../supplemental-format';

/** Numeric input for aligner numbers and quantities; empty = `null`. */
export function WholeNumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  error,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max?: number;
  /** i18n key of the validation message. */
  error?: string;
}) {
  const { t } = useT();
  return (
    <TextInput
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      label={label}
      value={value === null ? '' : String(value)}
      onChange={(raw) => onChange(parseWholeNumber(raw))}
      error={error ? t(error) : undefined}
    />
  );
}
