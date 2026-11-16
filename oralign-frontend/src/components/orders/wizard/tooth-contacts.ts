/**
 * FDI chart geometry shared by the odontogram and the wizards that feed it.
 *
 * The odontogram draws each arch left to right as the patient's right half
 * then left half. A between-teeth contact (IPR, residual space…) is keyed
 * by its ANCHOR: the tooth that comes second in that render order (the slot
 * left of tooth N belongs to N). So the contact 17–18 is keyed 17, 21–22 is
 * keyed 22, 11–21 is keyed 21 and 31–41 is keyed 31.
 */

export const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;
export const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;

const UPPER_ROW: readonly number[] = [...UPPER_RIGHT, ...UPPER_LEFT];
const LOWER_ROW: readonly number[] = [...LOWER_RIGHT, ...LOWER_LEFT];
const RENDER_ROWS: readonly (readonly number[])[] = [UPPER_ROW, LOWER_ROW];

/** The arch a permanent FDI tooth sits in; null for any other number. */
export function toothArch(tooth: number): 'upper' | 'lower' | null {
  if (UPPER_ROW.includes(tooth)) return 'upper';
  if (LOWER_ROW.includes(tooth)) return 'lower';
  return null;
}

/** Anchor tooth → the tooth just before it in render order. */
const PREVIOUS_IN_ROW: ReadonlyMap<number, number> = new Map(
  RENDER_ROWS.flatMap((row) =>
    row.slice(1).map((tooth, index): [number, number] => [tooth, row[index]]),
  ),
);

/** A contact between two adjacent teeth, lower FDI number first. */
export type ToothContactPair = { fromTooth: number; toTooth: number };

/** Anchor (odontogram map key) of two teeth's contact; null if not adjacent. */
export function contactAnchor(toothA: number, toothB: number): number | null {
  if (PREVIOUS_IN_ROW.get(toothA) === toothB) return toothA;
  if (PREVIOUS_IN_ROW.get(toothB) === toothA) return toothB;
  return null;
}

/** The contact an anchor stands for; null for a tooth that anchors none. */
export function contactFromAnchor(anchor: number): ToothContactPair | null {
  const previous = PREVIOUS_IN_ROW.get(anchor);
  if (previous === undefined) return null;
  return {
    fromTooth: Math.min(anchor, previous),
    toTooth: Math.max(anchor, previous),
  };
}
