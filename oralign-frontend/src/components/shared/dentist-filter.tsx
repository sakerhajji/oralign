'use client';

import { useId, useMemo } from 'react';
import { SearchableCombobox, type ComboboxItem } from '@/components/ui/searchable-combobox';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

export interface DentistOption {
  id: string;
  fullName: string;
  email?: string | null;
}

/**
 * A list filter on one dentist, typed to find: a long list of practitioners
 * is searched by name or e-mail instead of scrolled. It sits among the
 * list's selects and reads like them — the dimension ("Praticien") at rest,
 * the chosen dentist, highlighted, once set — and is cleared with its ×.
 *
 * The filter keeps the dentist's id, never the name, so two dentists of the
 * same name stay apart; those two show their e-mail beside the name.
 * Admins only (the page does not render it for a dentist).
 */
export function DentistFilter({
  label,
  value,
  onChange,
  dentists,
  loading = false,
  className,
}: {
  /** The dimension's name, shown at rest ("Praticien"). */
  label: string;
  /** 'all' or a dentist id. */
  value: string;
  onChange: (dentist: string) => void;
  dentists: readonly DentistOption[];
  loading?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const id = useId();

  const items = useMemo<ComboboxItem[]>(() => {
    const seen = new Map<string, number>();
    for (const dentist of dentists) {
      const name = dentist.fullName.trim().toLowerCase();
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    return dentists.map((dentist) => {
      const shared = (seen.get(dentist.fullName.trim().toLowerCase()) ?? 0) > 1;
      return {
        value: dentist.id,
        label: dentist.fullName,
        hint: shared ? (dentist.email ?? undefined) : undefined,
        // Typing a name or an e-mail finds the dentist.
        keywords: `${dentist.fullName} ${dentist.email ?? ''}`,
      };
    });
  }, [dentists]);

  // A dentist from the URL who is not listed (yet) still reads as a filter.
  const selectedItem =
    value !== 'all' && !items.some((item) => item.value === value)
      ? { value, label: t('listUi.dentist.unlisted') }
      : null;
  const current =
    value === 'all'
      ? null
      : (items.find((item) => item.value === value)?.label ?? selectedItem?.label ?? null);

  return (
    <>
      {/* The trigger shows the value only once set: its name says both. */}
      <label htmlFor={id} className="sr-only">
        {current ? t('listUi.dentist.named', { label, value: current }) : label}
      </label>
      <SearchableCombobox
        id={id}
        value={value === 'all' ? null : value}
        onChange={(next) => onChange(next ?? 'all')}
        items={items}
        selectedItem={selectedItem}
        loading={loading}
        placeholder={label}
        emptyLabel={t('listUi.dentist.none')}
        clearable
        // The same chip as FilterSelect beside it: radius, ground, border,
        // and the highlighted state once a dentist is set.
        className={cn(
          'h-9 rounded-lg border-input bg-transparent',
          value === 'all'
            ? 'text-muted-foreground'
            : 'border-foreground/25 bg-muted/50 font-medium text-foreground',
          className,
        )}
      />
    </>
  );
}
