'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption<V extends string> {
  value: V;
  label: string;
}

/**
 * One list filter as a compact select.
 *
 * At its resting value the trigger names the dimension ("Rôle"); set to
 * anything else it shows the chosen value, highlighted, so the active
 * filters read straight off the toolbar without a separate chip row.
 */
export function FilterSelect<V extends string>({
  label,
  value,
  onValueChange,
  options,
  inactiveValue = 'all' as V,
  valueLabel,
  className,
}: {
  label: string;
  value: V;
  onValueChange: (value: V) => void;
  options: FilterOption<V>[];
  /** The value that means "not filtering" (default `'all'`). */
  inactiveValue?: V;
  /**
   * What the trigger shows for the active value when its option's name is
   * not enough (a custom period shows its days, "1 – 6 nov. 2026").
   */
  valueLabel?: string;
  className?: string;
}) {
  const active = value !== inactiveValue;
  const shown = active
    ? (valueLabel ?? options.find((option) => option.value === value)?.label)
    : label;
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as V)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'w-full min-w-0 data-[size=default]:h-9 xl:w-44',
          active
            ? 'border-foreground/25 bg-muted/50 font-medium'
            : 'text-muted-foreground',
          className,
        )}
      >
        <SelectValue>{shown}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
