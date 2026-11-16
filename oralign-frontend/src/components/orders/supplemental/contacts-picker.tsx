'use client';

import { useCallback, useMemo } from 'react';
import { FieldError } from '@/components/orders/wizard';
import { contactAnchor } from '@/components/orders/wizard/tooth-contacts';
import { useT } from '@/lib/i18n/lang-context';
import type {
  ArchTreatment,
  SupplementalContactPurpose,
  SupplementalToothContact,
  ToothInstruction,
  ToothInstructionType,
} from '@/lib/types';
import { ArchFirstNotice } from './arch-first-notice';
import { LazyOdontogram } from './lazy-odontogram';
import { CONTACT_AMOUNT_RANGE } from './supplemental-constants';
import { isInTreatedArch } from './supplemental-draft';
import { formatContact, formatMm, parseMm } from './supplemental-format';
import { contactsFor, isValidContactAmount } from './tooth-details';

export type ContactChange = (
  purpose: SupplementalContactPurpose,
  pair: { fromTooth: number; toTooth: number },
  amountMm: number | null,
) => void;

// A contacts-only chart: no tooth can be marked. Module constants keep the
// memoised odontogram's props stable.
const NO_TEETH: ToothInstruction[] = [];
const NO_PALETTE: readonly ToothInstructionType[] = [];
const IGNORE_TEETH = () => undefined;

/**
 * Odontogram whose only layer is the between-teeth contacts: a tap between
 * two adjacent teeth opens the amount popover (mm). The chart keys each
 * contact by its anchor tooth; this component maps that to the request's
 * `{fromTooth, toTooth, amountMm}` rows. Only the treated arch(es) are
 * drawn. An amount is rounded to two decimals, and one outside the
 * purpose's range is refused in the popover, so the draft never holds a
 * value the server rejects. `onContactChange` must be stable.
 */
export function ContactsPicker({
  purpose,
  arch,
  contacts,
  onContactChange,
  error,
}: {
  purpose: SupplementalContactPurpose;
  /** Treated arch(es); null until the arch question is answered. */
  arch: ArchTreatment | null;
  contacts: readonly SupplementalToothContact[];
  onContactChange: ContactChange;
  /** i18n key of the validation message. */
  error?: string;
}) {
  const { t, lang } = useT();
  const { min, max } = CONTACT_AMOUNT_RANGE[purpose];
  const selected = useMemo(
    () =>
      contactsFor(contacts, purpose).filter(
        (contact) =>
          isInTreatedArch(contact.fromTooth, arch) && isInTreatedArch(contact.toTooth, arch),
      ),
    [contacts, purpose, arch],
  );
  const amounts = useMemo(() => {
    const byAnchor = new Map<number, string>();
    for (const contact of selected) {
      const anchor = contactAnchor(contact.fromTooth, contact.toTooth);
      if (anchor !== null) byAnchor.set(anchor, String(contact.amountMm));
    }
    return byAnchor;
  }, [selected]);
  const rangeMessage = t('supplemental.pickers.contactRange', {
    min: formatMm(min, lang),
    max: formatMm(max, lang),
  });
  const validateAmount = useCallback(
    (raw: string) => {
      const amount = parseMm(raw);
      return amount !== null && isValidContactAmount(amount, purpose) ? null : rangeMessage;
    },
    [purpose, rangeMessage],
  );
  const handleContactChange = useCallback(
    (fromTooth: number, toTooth: number, payload: { value: string | null }) => {
      const amount = parseMm(payload.value);
      // The popover already refused anything else; never store it anyway.
      if (amount !== null && !isValidContactAmount(amount, purpose)) return;
      onContactChange(purpose, { fromTooth, toTooth }, amount);
    },
    [onContactChange, purpose],
  );
  const label = t(`supplemental.purpose.contact.${purpose}`);

  if (arch === null) return <ArchFirstNotice />;

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <LazyOdontogram
        value={NO_TEETH}
        onChange={IGNORE_TEETH}
        palette={NO_PALETTE}
        visibleArch={arch}
        iprValues={amounts}
        onIprChange={handleContactChange}
        contactUnitLabel={t(`supplemental.pickers.contactUnit.${purpose}`)}
        contactMaxMm={max}
        validateContactAmount={validateAmount}
        title={label}
        subtitle={t('supplemental.pickers.contactsHint', {
          min: formatMm(min, lang),
          max: formatMm(max, lang),
        })}
        defaultShowLegend={false}
        hideLegendToggle
      />
      <div aria-live="polite" className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {selected.length > 0
            ? selected.map((contact) => formatContact(contact, lang)).join(' · ')
            : t('supplemental.pickers.noContacts')}
        </p>
        <FieldError message={error ? t(error) : undefined} />
      </div>
    </div>
  );
}
