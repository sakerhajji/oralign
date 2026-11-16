'use client';

import { useCallback, useMemo } from 'react';
import { FieldError } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import type {
  ArchTreatment,
  SupplementalToothPurpose,
  SupplementalToothSelection,
  ToothInstruction,
} from '@/lib/types';
import { ArchFirstNotice } from './arch-first-notice';
import { LazyOdontogram } from './lazy-odontogram';
import { TOOTH_PURPOSE_COLOR } from './supplemental-constants';
import { isInTreatedArch } from './supplemental-draft';
import { formatTeeth } from './supplemental-format';
import { teethFor } from './tooth-details';

export type TeethChange = (purpose: SupplementalToothPurpose, toothNumbers: number[]) => void;

/**
 * Odontogram limited to ONE mark: a tap toggles the tooth for `purpose`
 * (no colour popover), so a chart can never mix contradictory marks. Only
 * the treated arch(es) are drawn; teeth kept from an arch no longer
 * treated are neither shown nor sent. `onTeethChange` must be stable —
 * the chart is memoised.
 */
export function TeethPicker({
  purpose,
  arch,
  teeth,
  onTeethChange,
  error,
}: {
  purpose: SupplementalToothPurpose;
  /** Treated arch(es); null until the arch question is answered. */
  arch: ArchTreatment | null;
  teeth: readonly SupplementalToothSelection[];
  onTeethChange: TeethChange;
  /** i18n key of the validation message. */
  error?: string;
}) {
  const { t } = useT();
  const color = TOOTH_PURPOSE_COLOR[purpose];
  const palette = useMemo(() => [color], [color]);
  const selected = useMemo(
    () => teethFor(teeth, purpose).filter((tooth) => isInTreatedArch(tooth, arch)),
    [teeth, purpose, arch],
  );
  const value = useMemo<ToothInstruction[]>(
    () => selected.map((toothNumber) => ({ toothNumber, type: color })),
    [selected, color],
  );
  const handleChange = useCallback(
    (next: ToothInstruction[]) =>
      onTeethChange(
        purpose,
        next.filter((mark) => mark.type === color).map((mark) => mark.toothNumber),
      ),
    [onTeethChange, purpose, color],
  );
  const label = t(`supplemental.purpose.tooth.${purpose}`);

  if (arch === null) return <ArchFirstNotice />;

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <LazyOdontogram
        value={value}
        onChange={handleChange}
        palette={palette}
        visibleArch={arch}
        markLabel={label}
        title={label}
        subtitle={t('supplemental.pickers.teethHint')}
        defaultShowLegend={false}
        hideLegendToggle
      />
      <div aria-live="polite" className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {selected.length > 0
            ? t('supplemental.pickers.selectedTeeth', { teeth: formatTeeth(selected) })
            : t('supplemental.pickers.noTeeth')}
        </p>
        <FieldError message={error ? t(error) : undefined} />
      </div>
    </div>
  );
}
