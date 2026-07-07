'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { conditionLabel } from '@/lib/chief-complaint';
import {
  CLINICAL_CONDITION_OPTIONS,
  CLINICAL_CONDITION_OTHER,
  type ClinicalCondition,
} from '@/lib/types';

/**
 * Multi-select checkbox grid for the patient's clinical conditions
 * plus an optional "Other" free-text input that only appears when the
 * "Other" box is checked.
 *
 * Shared between the standalone /dashboard/patients form and the
 * inline "Create a new patient" step inside the order wizard so both
 * surfaces stay 1:1 in feature parity — see PatientFormDialog and
 * PatientStep for the two call sites.
 *
 * Storage: parent owns two pieces of state and passes them in:
 *   • `conditions`  → string[] of selected labels (a subset of
 *     `CLINICAL_CONDITION_OPTIONS`; the backend tolerates labels
 *     outside the list but the UI only writes from the canonical set).
 *   • `otherDetail` → free-text detail, persisted only when "Other"
 *     is in `conditions`. The component still RENDERS the input
 *     whenever "Other" is checked; the parent decides whether to
 *     clear `otherDetail` if "Other" is unchecked.
 */
export interface ClinicalConditionsFieldProps {
  conditions: string[];
  otherDetail: string;
  disabled?: boolean;
  /** Optional id prefix so multiple instances on the same page get unique checkbox ids. */
  idPrefix?: string;
  /**
   * Override the section legend. Defaults to "Reason for consultation"
   * because the clinical team treats this list as the chief-complaint
   * source (`Crowding`, `Deep bite`, … are simultaneously the
   * conditions and the reason the patient comes in). Pass a custom
   * value if a different surface needs a different label.
   */
  legendLabel?: string;
  /** Override the small descriptive paragraph above the grid. */
  descriptionText?: string;
  /** Called on every checkbox toggle with the full next list (order preserved per CLINICAL_CONDITION_OPTIONS). */
  onConditionsChange: (next: string[]) => void;
  /** Called whenever the user types in the "Other" detail input. */
  onOtherDetailChange: (next: string) => void;
  /** Validation error from zod / parent. */
  otherDetailError?: string;
}

export function ClinicalConditionsField({
  conditions,
  otherDetail,
  disabled,
  idPrefix = 'clinical-conditions',
  // When the caller passes nothing, fall back to the i18n dictionary
  // so the legend + description flip with the language toggle. A caller
  // that needs a custom label still wins — the override path is kept.
  legendLabel,
  descriptionText,
  onConditionsChange,
  onOtherDetailChange,
  otherDetailError,
}: ClinicalConditionsFieldProps) {
  const { t } = useT();
  const resolvedLegend = legendLabel ?? t('orderForm.patient.reasonLegend');
  const resolvedDescription =
    descriptionText ?? t('orderForm.patient.reasonDescription');
  const isOtherSelected = conditions.includes(CLINICAL_CONDITION_OTHER);

  const toggle = (condition: ClinicalCondition) => {
    const without = conditions.filter((c) => c !== condition);
    const next = conditions.includes(condition)
      ? without
      : [...without, condition];
    // Re-order the result to match the canonical option list so the
    // stored array is deterministic regardless of click order. This
    // keeps render output stable and makes server-side diffs cleaner.
    const ordered = CLINICAL_CONDITION_OPTIONS.filter((opt) =>
      next.includes(opt),
    );
    onConditionsChange(ordered);

    // If the planner just UNCHECKED "Other", clear the detail field so
    // it doesn't keep a stale value in the saved payload. The detail
    // only has meaning while "Other" is selected.
    if (condition === CLINICAL_CONDITION_OTHER && !next.includes(condition)) {
      onOtherDetailChange('');
    }
  };

  return (
    <fieldset className="space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">{resolvedLegend}</legend>
      <p className="text-xs text-muted-foreground">{resolvedDescription}</p>
      <div
        role="group"
        aria-label={resolvedLegend}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CLINICAL_CONDITION_OPTIONS.map((opt) => {
          const checked = conditions.includes(opt);
          const id = `${idPrefix}-${opt.toLowerCase().replace(/\s+/g, '-')}`;
          // Storage stays English; only the displayed label flips. If
          // the option ever drifts away from the dict map we fall back
          // to the raw English label so the row still renders.
          const label = conditionLabel(opt, t);
          return (
            <label
              key={opt}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition',
                checked
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-input bg-background hover:bg-accent/40',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                id={id}
                type="checkbox"
                className="h-4 w-4 cursor-pointer"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(opt)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>

      {isOtherSelected && (
        <div className="space-y-2 pt-1">
          <Label htmlFor={`${idPrefix}-other-detail`} className="text-sm">
            {t('orderForm.patient.reasonOtherLabel')}
          </Label>
          <textarea
            id={`${idPrefix}-other-detail`}
            value={otherDetail}
            onChange={(e) => onOtherDetailChange(e.target.value)}
            disabled={disabled}
            placeholder={t('orderForm.patient.reasonOtherPh')}
            maxLength={500}
            className={cn(
              'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              otherDetailError && 'border-red-500',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          />
          {otherDetailError && (
            <p className="text-sm text-red-500">{otherDetailError}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
