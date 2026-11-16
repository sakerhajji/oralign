'use client';

import { useT } from '@/lib/i18n/lang-context';
import type {
  SupplementalContactPurpose,
  SupplementalToothPurpose,
} from '@/lib/types';
import { formatCalendarDay, isCalendarDate } from '@/lib/utils/business-day';
import { optionLabelKey, type OptionGroupName } from '../option-group';
import type { SupplementalDraft } from '../supplemental-draft';
import { contactsFor, teethFor } from '../tooth-details';
import { formatContact, formatTeeth } from '../supplemental-format';

/** Turns answers into the read-only strings of the summary. */
export function useSummaryText(answers: SupplementalDraft) {
  const { t, lang } = useT();

  const option = (group: OptionGroupName, value: string | null): string | null =>
    value === null ? null : t(optionLabelKey(group, value));

  const withDetails = (label: string | null, details: string): string | null =>
    label && details ? t('supplemental.summary.withDetails', { label, details }) : label;

  return {
    t,
    option,
    yesNo: (value: boolean | null) => option('yesNo', value === null ? null : value ? 'yes' : 'no'),
    number: (value: number | null) =>
      value === null ? null : t('supplemental.summary.alignerNumber', { number: value }),
    withDetails,
    /** "Do not move these teeth: 13, 23". */
    withTeeth: (label: string | null, purpose: SupplementalToothPurpose) =>
      withDetails(label, formatTeeth(teethFor(answers.teeth, purpose))),
    /** "Close these spaces: 11–21: 0.5 mm, 31–41: 0.3 mm". */
    withContacts: (label: string | null, purpose: SupplementalContactPurpose) =>
      withDetails(
        label,
        contactsFor(answers.contacts, purpose)
          .map((contact) => formatContact(contact, lang))
          .join(', '),
      ),
    day: (day: string) => (isCalendarDate(day) ? formatCalendarDay(day, lang, 'full') : null),
  };
}
