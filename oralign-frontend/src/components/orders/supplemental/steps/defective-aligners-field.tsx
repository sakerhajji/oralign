'use client';

import { useState } from 'react';
import { TextInput } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { fieldDomId, questionErrorId } from '../clinical-question';
import { NoticeBox } from '../notice-box';
import { parseAlignerNumbers } from '../supplemental-format';

const FIELD = 'defectiveAligners';
const COPY = 'supplemental.questions.warranty';

type FieldProps = {
  value: readonly number[];
  onChange: (value: number[]) => void;
};

/** One button per aligner, 1 to `max`: tap every defective one. */
function AlignerGrid({ value, onChange, max, invalid }: FieldProps & { max: number; invalid: boolean }) {
  const { t } = useT();
  // A number kept from another arch stays visible, so it can be unticked.
  const numbers = [
    ...Array.from({ length: max }, (_, index) => index + 1),
    ...value.filter((number) => number > max),
  ];
  const toggle = (number: number) =>
    onChange(
      value.includes(number)
        ? value.filter((selected) => selected !== number)
        : [...value, number].sort((a, b) => a - b),
    );

  return (
    <div
      role="group"
      aria-label={t(`${COPY}.aligner`)}
      aria-describedby={invalid ? questionErrorId(FIELD) : undefined}
      className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2 sm:max-w-2xl"
    >
      {numbers.map((number) => {
        const selected = value.includes(number);
        return (
          <button
            key={number}
            type="button"
            aria-pressed={selected}
            aria-label={t('supplemental.questions.photos.slots.aligner', { number })}
            onClick={() => toggle(number)}
            className={cn(
              'inline-flex h-11 items-center justify-center rounded-md border bg-background text-sm font-semibold tabular-nums transition',
              'hover:border-primary/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
              selected && 'border-primary bg-primary text-primary-foreground hover:border-primary',
              number > max && 'border-red-600 bg-red-600 text-white hover:border-red-600',
            )}
          >
            {number}
          </button>
        );
      })}
    </div>
  );
}

/** Used when the case gives no upper limit to list: "1, 2, 4". */
function AlignerNumbersInput({ value, onChange }: FieldProps) {
  const { t } = useT();
  const [text, setText] = useState(() => value.join(', '));
  return (
    <div className="sm:max-w-xs">
      <TextInput
        id={fieldDomId(FIELD)}
        inputMode="numeric"
        label={t(`${COPY}.alignerLabel`)}
        value={text}
        onChange={(raw) => {
          setText(raw);
          onChange(parseAlignerNumbers(raw));
        }}
      />
    </div>
  );
}

/**
 * Every defective aligner of the claim. `max` is the highest number the
 * chosen arch allows; null when nothing limits the numbers.
 */
export function DefectiveAlignersField({
  value,
  onChange,
  max,
  archChosen,
  invalid,
}: FieldProps & { max: number | null; archChosen: boolean; invalid: boolean }) {
  const { t } = useT();
  if (max !== null && !archChosen) {
    return <NoticeBox tone="warning">{t(`${COPY}.alignerArchFirst`)}</NoticeBox>;
  }
  if (max !== null && max < 1 && value.length === 0) {
    return <NoticeBox tone="warning">{t(`${COPY}.alignerNone`)}</NoticeBox>;
  }
  return (
    <div className="space-y-3">
      {max === null ? (
        <AlignerNumbersInput value={value} onChange={onChange} />
      ) : (
        <AlignerGrid value={value} onChange={onChange} max={max} invalid={invalid} />
      )}
      <p aria-live="polite" className="text-sm font-medium">
        {value.length > 0
          ? t(`${COPY}.alignerSelected`, { numbers: value.join(', ') })
          : t(`${COPY}.alignerNoneSelected`)}
      </p>
    </div>
  );
}
