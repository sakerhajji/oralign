'use client';

import { useId, useMemo } from 'react';
import { SearchableCombobox, type ComboboxItem } from '@/components/ui/searchable-combobox';
import { usePaymentPractitioners } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import type { PaymentPractitioner, PaymentPurpose } from '@/lib/types';
import { cn } from '@/lib/utils';

const NO_PRACTITIONERS: PaymentPractitioner[] = [];

/**
 * The dentists a tab can be narrowed to: only those with a payment of the
 * tab's kind (the server lists them), typed to find. The filter keeps the
 * dentist's id, never the name, so two dentists of the same name stay
 * apart — and those two show their e-mail beside the name to be told
 * apart. Admins only (the parent does not render it for a dentist).
 */
export function PractitionerFilter({
  purpose,
  value,
  onChange,
  className,
}: {
  purpose: PaymentPurpose;
  /** 'all' or a dentist id. */
  value: string;
  onChange: (doctor: string) => void;
  className?: string;
}) {
  const { t } = useT();
  const id = useId();
  const query = usePaymentPractitioners(purpose);
  const practitioners = query.data ?? NO_PRACTITIONERS;

  const items = useMemo<ComboboxItem[]>(() => {
    const seen = new Map<string, number>();
    for (const doctor of practitioners) {
      const name = doctor.fullName.trim().toLowerCase();
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    return practitioners.map((doctor) => {
      const shared = (seen.get(doctor.fullName.trim().toLowerCase()) ?? 0) > 1;
      return {
        value: doctor.id,
        label: doctor.fullName,
        hint: shared ? doctor.email : undefined,
        // Typing a name or an e-mail finds the dentist.
        keywords: `${doctor.fullName} ${doctor.email}`,
      };
    });
  }, [practitioners]);

  // A dentist from the URL who is not listed (yet) still reads as a filter.
  const selectedItem =
    value !== 'all' && !items.some((item) => item.value === value)
      ? { value, label: t('paymentsDesk.filters.practitionerUnlisted') }
      : null;
  const current =
    value === 'all'
      ? t('paymentsDesk.filters.practitionerAll')
      : (items.find((item) => item.value === value)?.label ?? selectedItem?.label ?? '');

  return (
    <>
      {/* The trigger shows only the value: the label names the filter too. */}
      <label htmlFor={id} className="sr-only">
        {t('paymentsDesk.filters.chip', {
          label: t('paymentsDesk.filters.practitioner'),
          value: current,
        })}
      </label>
      <SearchableCombobox
        id={id}
        value={value === 'all' ? null : value}
        onChange={(next) => onChange(next ?? 'all')}
        items={items}
        selectedItem={selectedItem}
        loading={query.isPending}
        placeholder={t('paymentsDesk.filters.practitionerAll')}
        emptyLabel={t('paymentsDesk.filters.practitionerNone')}
        clearable
        className={cn(
          'h-9 rounded-lg',
          value !== 'all' && 'border-foreground/40 font-medium text-foreground',
          className,
        )}
      />
    </>
  );
}
