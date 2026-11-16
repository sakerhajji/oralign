'use client';

import type {
  ArchTreatment,
  SupplementalContactPurpose,
  SupplementalToothContact,
  SupplementalToothPurpose,
  SupplementalToothSelection,
} from '@/lib/types';
import { ContactsPicker, type ContactChange } from '../../contacts-picker';
import { OptionGroup, type OptionGroupName } from '../../option-group';
import { CONTACT_PURPOSE_OWNER, TOOTH_PURPOSE_OWNER } from '../../supplemental-constants';
import { TeethPicker, type TeethChange } from '../../teeth-picker';
import type { FieldErrors } from '../../supplemental-validation';

type ChoiceProps<T extends string> = {
  group: OptionGroupName;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  describedBy: string;
  invalid: boolean;
  withHints?: boolean;
  errors: FieldErrors;
  /** Treated arch(es): the chart shows only them. */
  arch: ArchTreatment | null;
};

/**
 * A "pick one" whose detail option (e.g. "do not place attachments on
 * these teeth") reveals a chart limited to that option's tooth purpose.
 */
export function ChoiceWithTeeth<T extends string>({
  purpose,
  arch,
  teeth,
  onTeethChange,
  errors,
  withHints,
  ...choice
}: ChoiceProps<T> & {
  purpose: SupplementalToothPurpose;
  teeth: readonly SupplementalToothSelection[];
  onTeethChange: TeethChange;
}) {
  const showChart = TOOTH_PURPOSE_OWNER[purpose]?.option === choice.value;
  return (
    <>
      <OptionGroup {...choice} layout="stack" withHints={withHints} />
      {showChart && (
        <TeethPicker
          purpose={purpose}
          arch={arch}
          teeth={teeth}
          onTeethChange={onTeethChange}
          error={errors[`teeth.${purpose}`]}
        />
      )}
    </>
  );
}

/** Same pattern for options detailed by contacts with an amount in mm. */
export function ChoiceWithContacts<T extends string>({
  purpose,
  arch,
  contacts,
  onContactChange,
  errors,
  withHints,
  ...choice
}: ChoiceProps<T> & {
  purpose: SupplementalContactPurpose;
  contacts: readonly SupplementalToothContact[];
  onContactChange: ContactChange;
}) {
  const showChart = CONTACT_PURPOSE_OWNER[purpose].option === choice.value;
  return (
    <>
      <OptionGroup {...choice} layout="stack" withHints={withHints} />
      {showChart && (
        <ContactsPicker
          purpose={purpose}
          arch={arch}
          contacts={contacts}
          onContactChange={onContactChange}
          error={errors[`contacts.${purpose}`]}
        />
      )}
    </>
  );
}
