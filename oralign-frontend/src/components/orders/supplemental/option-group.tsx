'use client';

import { ChoiceCard, OptionPill } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';

/** Dictionary groups under `supplemental.options.*` (labels) and `supplemental.optionHints.*`. */
export type OptionGroupName =
  | 'reason'
  | 'archTreatment'
  | 'oppositeArch'
  | 'yesNo'
  | 'clinicalObjective'
  | 'movementRestriction'
  | 'apCorrection'
  | 'apOption'
  | 'attachmentPlan'
  | 'existingAttachments'
  | 'iprPlan'
  | 'previousIpr'
  | 'cutoutPlan'
  | 'residualSpaces'
  | 'impressionMethod'
  | 'replacementReason'
  | 'urgency'
  | 'transferPurpose'
  | 'defect'
  | 'coverage';

export function optionLabelKey(group: OptionGroupName, value: string): string {
  return `supplemental.options.${group}.${value}`;
}

export function optionHintKey(group: OptionGroupName, value: string): string {
  return `supplemental.optionHints.${group}.${value}`;
}

const LAYOUT = {
  /** Pills side by side from small screens up. */
  pills: 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3',
  /** Short yes/no style pairs. */
  pair: 'grid grid-cols-2 gap-2 sm:max-w-sm',
  /** One option per line, for long clinical sentences. */
  stack: 'grid gap-2',
  /** Cards with a description, two per row on wider screens. */
  cards: 'grid gap-2 md:grid-cols-2',
  /** Three short cards side by side on wider screens. */
  cardsTrio: 'grid gap-2 md:grid-cols-3',
} as const;

/**
 * A `role="radiogroup"` of OptionPills (or ChoiceCards with a hint line),
 * the order wizard's "pick one" control. Labels come from the dictionary.
 */
export function OptionGroup<T extends string>({
  group,
  options,
  value,
  onChange,
  ariaLabel,
  describedBy,
  invalid,
  layout = 'pills',
  withHints = false,
  disabled,
}: {
  group: OptionGroupName;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  describedBy?: string;
  invalid?: boolean;
  layout?: keyof typeof LAYOUT;
  /** Render ChoiceCards with `supplemental.optionHints.<group>.<value>`. */
  withHints?: boolean;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-describedby={invalid ? describedBy : undefined}
      aria-invalid={invalid || undefined}
      className={LAYOUT[layout]}
    >
      {options.map((option) =>
        withHints ? (
          <ChoiceCard
            key={option}
            radio
            active={value === option}
            disabled={disabled}
            title={t(optionLabelKey(group, option))}
            description={t(optionHintKey(group, option))}
            onClick={() => onChange(option)}
          />
        ) : (
          <OptionPill
            key={option}
            active={value === option}
            disabled={disabled}
            label={t(optionLabelKey(group, option))}
            onClick={() => onChange(option)}
          />
        ),
      )}
    </div>
  );
}

const YES = 'yes';
const NO = 'no';
const YES_NO = [YES, NO] as const;

/** Oui / Non pills for a boolean answer; `null` = not answered yet. */
export function YesNoGroup({
  value,
  onChange,
  ariaLabel,
  describedBy,
  invalid,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <OptionGroup
      group="yesNo"
      layout="pair"
      options={YES_NO}
      value={value === null ? null : value ? YES : NO}
      onChange={(answer) => onChange(answer === YES)}
      ariaLabel={ariaLabel}
      describedBy={describedBy}
      invalid={invalid}
    />
  );
}
