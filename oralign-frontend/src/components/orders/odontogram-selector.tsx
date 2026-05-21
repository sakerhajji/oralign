'use client';

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Check, Info, Palette, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToothInstruction, ToothInstructionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TOOTH_VIEWBOXES } from './tooth-viewboxes';

// ── Layout (FDI numbering) ──────────────────────────────────────────────────
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;

const MIRRORED = new Set<number>([...UPPER_LEFT, ...LOWER_RIGHT]);

// Sprite URL — Next.js serves /public files at the root. The browser fetches
// this once, caches it as an SVG document, then resolves every <use> through
// the cached document. Replaces the 4.3 MB inline JS module.
const SPRITE_URL = '/teeth-sprite.svg';

// ── Color → instruction mapping ─────────────────────────────────────────────
type ColorEntry = {
  type: ToothInstructionType;
  label: string;
  short: string;
  hex: string;
  outline: string;
};

const COLORS: readonly ColorEntry[] = [
  // ── Order-level (doctor's instructions) ──────────────────────────
  {
    type: ToothInstructionType.NO_ATTACHMENTS,
    label: 'No Attachments',
    short: 'NA',
    hex: '#2563eb', // blue-600
    outline: '#3b82f6',
  },
  {
    type: ToothInstructionType.DO_NOT_MOVE,
    label: 'Do Not Move',
    short: 'DNM',
    hex: '#ef4444', // red-500
    outline: '#f87171',
  },
  {
    type: ToothInstructionType.NO_IPR,
    label: 'No IPR',
    short: 'NoIPR',
    hex: '#22c55e', // green-500
    outline: '#4ade80',
  },
  {
    // Extract — bumped from the previous sky-blue to a distinct orange
    // so it doesn't get visually confused with No-Attachments (also
    // blue) on the doctor's order odontogram.
    type: ToothInstructionType.EXTRACT,
    label: 'Extract',
    short: 'EXT',
    hex: '#f97316', // orange-500
    outline: '#fb923c',
  },
  // ── Treatment-plan level (planner's marks) ───────────────────────
  {
    // Pink swatch — the planner placed an attachment on this tooth.
    // Used in the treatment-plan editor's attachments-mode picker
    // (visibleColors filter, controlled by mode='attachments').
    type: ToothInstructionType.ATTACHMENT,
    label: 'Attachment',
    short: 'ATT',
    hex: '#ec4899', // pink-500
    outline: '#f472b6',
  },
] as const;

const DEFAULT_TOOTH = '#f1e8d4';
const DEFAULT_OUTLINE = '#f3eeea';
const COLOR_BY_TYPE = new Map<ToothInstructionType, ColorEntry>(
  COLORS.map((c) => [c.type, c]),
);

// ── Component ──────────────────────────────────────────────────────────────

export function OdontogramSelector({
  value,
  onChange,
  disabled,
  iprValues,
  iprNotes,
  onIprChange,
  mode = 'movement',
  title,
  subtitle,
}: {
  value: ToothInstruction[];
  onChange: (value: ToothInstruction[]) => void;
  disabled?: boolean;
  /**
   * Optional per-tooth IPR values (mm as a string). When provided together
   * with `onIprChange`, the odontogram renders clickable purple bars
   * between adjacent teeth in each arch half AND across the midline
   * (slots anchored on tooth 21 and 31). The key is the "right tooth
   * in render order" — i.e. the slot to the LEFT of tooth N belongs to N.
   * Tooth 18 and 48 cannot have IPR (they're at the start of their
   * respective halves). When omitted, the IPR layer is hidden —
   * preserves the existing wizard / read-only behaviour.
   */
  iprValues?: Map<number, string>;
  /**
   * Optional per-tooth stripping notes — a SECOND value persisted alongside
   * the IPR amount. Used for things like "aligner step #" or "side"
   * depending on the clinic's protocol. Rendered in muted gray next to the
   * primary IPR mm label. Same key as `iprValues`.
   */
  iprNotes?: Map<number, string>;
  /**
   * Combined setter for the IPR slot — passes both the mm value AND
   * the optional stripping note in ONE call so the parent does ONE
   * persist rather than two. Two-call shape was racing the backend's
   * delete + createMany transaction and triggering the P2002 unique
   * constraint failure on (orderId, toothNumber, type). Pass `null`
   * for either field to clear it.
   */
  onIprChange?: (
    toothNumber: number,
    payload: { value: string | null; note: string | null },
  ) => void;
  /**
   * 'movement'   — order-wizard context: shows all 4 instruction colors
   *                (No Attachments / Do Not Move / No IPR / Extract).
   * 'attachments' — treatment-plan editor context: a single attachment
   *                colour, the rest of the picker is hidden. The planner
   *                only needs to mark which teeth carry an attachment.
   */
  mode?: 'movement' | 'attachments';
  /** Override the default section heading. */
  title?: string;
  /** Override the default section subheading. */
  subtitle?: string;
}) {
  const [showLegend, setShowLegend] = useState(true);
  const [popup, setPopup] = useState<{
    tooth: number;
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [iprPopup, setIprPopup] = useState<{
    tooth: number;
    x: number;
    y: number;
  } | null>(null);

  // Show the IPR layer whenever values are provided — even if no setter is
  // attached. Read-only viewers (doctor / order-detail read screen) still
  // benefit from seeing where IPR is planned. Clicking is gated separately.
  const iprVisible = !!iprValues;
  const iprEditable = !!onIprChange && !disabled;

  // In 'attachments' mode the picker collapses to a single colour — the
  // planner only needs to mark "the planner placed an attachment here".
  // The 4 doctor-level signals (No Attachments / Do Not Move / No IPR /
  // Extract) are NOT exposed in the attachments-mode picker — they're
  // the doctor's prescriptions on the order, not the plan, and the
  // planner shouldn't be changing them from this surface.
  const visibleColors = useMemo<readonly ColorEntry[]>(
    () =>
      mode === 'attachments'
        ? COLORS.filter((c) => c.type === ToothInstructionType.ATTACHMENT)
        : // Movement mode: show every type EXCEPT the planner-only
          // ATTACHMENT colour (which only makes sense on the plan
          // odontogram). Order is preserved for legend stability.
          COLORS.filter((c) => c.type !== ToothInstructionType.ATTACHMENT),
    [mode],
  );

  // One instruction per tooth — restricted to the modes-current
  // palette so types that don't belong on this surface stay invisible.
  //
  // Example: when the order detail page renders the odontogram in
  // 'movement' mode, the value array may STILL contain ATTACHMENT
  // entries written by the planner via the treatment-plan editor.
  // We must NOT paint those teeth pink on the order page — the user
  // explicitly wants attachments to live only in the treatment view.
  // The filter below skips any tooth-instruction whose type isn't
  // part of the current mode's palette.
  const visibleTypes = useMemo(
    () => new Set(visibleColors.map((c) => c.type)),
    [visibleColors],
  );
  const assignments = useMemo(() => {
    const map = new Map<number, ToothInstructionType>();
    for (const item of value) {
      if (!visibleTypes.has(item.type)) continue;
      if (!map.has(item.toothNumber)) map.set(item.toothNumber, item.type);
    }
    return map;
  }, [value, visibleTypes]);

  // Keep onChange / value / disabled reachable from stable callbacks so
  // ToothButton's memoization actually holds across renders.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const onIprChangeRef = useRef(onIprChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;
  onIprChangeRef.current = onIprChange;

  const setTooth = useCallback(
    (toothNumber: number, type: ToothInstructionType | null) => {
      const without = valueRef.current.filter(
        (i) => i.toothNumber !== toothNumber,
      );
      onChangeRef.current(
        type ? [...without, { toothNumber, type }] : without,
      );
    },
    [],
  );

  const openIprPopup = useCallback(
    (toothNumber: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (disabledRef.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setIprPopup({
        tooth: toothNumber,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      });
    },
    [],
  );

  const closeIprPopup = useCallback(() => setIprPopup(null), []);

  const commitIpr = useCallback(
    (
      toothNumber: number,
      payload: { value: string | null; note: string | null },
    ) => {
      onIprChangeRef.current?.(toothNumber, payload);
      setIprPopup(null);
    },
    [],
  );

  const openPopup = useCallback(
    (toothNumber: number, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (disabledRef.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setPopup({
        tooth: toothNumber,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
        width: rect.width,
      });
    },
    [],
  );

  const closePopup = useCallback(() => setPopup(null), []);

  // Esc + scroll/resize close. Outside-click is handled in the popover itself
  // so we can ignore the click that opened it.
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopup();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closePopup, true);
    window.addEventListener('resize', closePopup);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', closePopup, true);
      window.removeEventListener('resize', closePopup);
    };
  }, [popup, closePopup]);

  return (
    <div className="space-y-5">
      <style>{ODONTOGRAM_CSS}</style>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {title ??
              (mode === 'attachments'
                ? 'Attachments & IPR'
                : 'Select tooth-level instructions')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {subtitle ??
              (mode === 'attachments'
                ? 'Tap a tooth to mark an attachment. Tap between teeth to set IPR (mm) and the optional stripping value.'
                : 'Tap any tooth to assign a color. Each tooth carries one instruction at a time.')}
          </p>
        </div>
        {/* In attachments mode there's only one colour, so the legend
            collapses into the helper text — no toggle needed. */}
        {mode === 'movement' && (
          <Button
            type="button"
            variant="ghost"
            className="justify-start text-primary"
            onClick={() => setShowLegend((s) => !s)}
          >
            <Palette className="mr-2 h-4 w-4" />
            {showLegend ? 'Hide' : 'View'} color legend
          </Button>
        )}
      </div>

      {mode === 'movement' && showLegend && (
        <ColorLegend assignments={assignments} colors={visibleColors} />
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="odo-scroll overflow-x-auto px-2 pt-8 pb-6 sm:px-5">
          <div className="mx-auto min-w-[560px] max-w-[1180px] sm:min-w-[640px]">
            <Arch
              row="upper"
              left={UPPER_RIGHT}
              right={UPPER_LEFT}
              assignments={assignments}
              activeTooth={popup?.tooth ?? null}
              activeIpr={iprPopup?.tooth ?? null}
              disabled={disabled}
              iprValues={iprVisible ? iprValues : undefined}
              iprNotes={iprVisible ? iprNotes : undefined}
              onToothClick={openPopup}
              onIprClick={iprEditable ? openIprPopup : undefined}
            />
            <div className="relative my-2 h-px bg-foreground/15">
              <span className="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/30" />
            </div>
            <Arch
              row="lower"
              left={LOWER_RIGHT}
              right={LOWER_LEFT}
              assignments={assignments}
              activeTooth={popup?.tooth ?? null}
              activeIpr={iprPopup?.tooth ?? null}
              disabled={disabled}
              iprValues={iprVisible ? iprValues : undefined}
              iprNotes={iprVisible ? iprNotes : undefined}
              onToothClick={openPopup}
              onIprClick={iprEditable ? openIprPopup : undefined}
            />
          </div>
        </div>

        <p className="px-3 pb-3 text-center text-xs text-muted-foreground sm:px-5">
          FDI numbering · Press{' '}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            Esc
          </kbd>{' '}
          to close the picker.
        </p>
      </div>

      {assignments.size > 0 ? (
        <div className="flex flex-wrap gap-2">
          {[...assignments.entries()]
            .sort(([a], [b]) => a - b)
            .map(([toothNumber, type]) => {
              const c = COLOR_BY_TYPE.get(type);
              return (
                <Badge
                  key={`${toothNumber}-${type}`}
                  variant="secondary"
                  className="gap-1.5 rounded-full px-3 py-1"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: c?.hex }}
                    aria-hidden
                  />
                  <span>Tooth {toothNumber}</span>
                  <span className="text-muted-foreground">{c?.label}</span>
                </Badge>
              );
            })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          No tooth-level instructions selected yet.
        </div>
      )}

      {popup && (
        <ColorPopover
          tooth={popup.tooth}
          anchorX={popup.x}
          anchorY={popup.y}
          currentType={assignments.get(popup.tooth)}
          colors={visibleColors}
          onPick={(type) => {
            // flushSync commits the color in the same frame as the click —
            // no popup-close animation can mask the change.
            flushSync(() => setTooth(popup.tooth, type));
            closePopup();
          }}
          onClose={closePopup}
        />
      )}

      {iprPopup && iprEditable && (
        <IprPopover
          tooth={iprPopup.tooth}
          anchorX={iprPopup.x}
          anchorY={iprPopup.y}
          currentValue={iprValues?.get(iprPopup.tooth)}
          currentNote={iprNotes?.get(iprPopup.tooth)}
          // Single combined commit — popover gathers both fields and
          // calls back ONCE so the parent fires ONE persist mutation.
          // Two-call shape was racing the backend's delete+createMany
          // transaction and triggering P2002.
          onCommit={(payload) => commitIpr(iprPopup.tooth, payload)}
          // Whether the popover should even show the stripping input
          // is governed by whether `iprNotes` was wired by the parent
          // — same effective semantics as the old onCommitNote prop.
          showStripping={!!iprNotes}
          onClose={closeIprPopup}
        />
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

function ColorLegend({
  assignments,
  colors,
}: {
  assignments: Map<number, ToothInstructionType>;
  /**
   * Restricted palette — only iterate over the colours that are valid
   * for the current mode. Otherwise the order-page legend would list
   * the pink Attachment row even though that colour belongs to the
   * treatment-plan editor.
   */
  colors: readonly ColorEntry[];
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      {colors.map((c) => {
        const teeth: number[] = [];
        assignments.forEach((type, tooth) => {
          if (type === c.type) teeth.push(tooth);
        });
        teeth.sort((a, b) => a - b);

        return (
          <div key={c.type} className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-block h-6 w-6 shrink-0 rounded-full border-2 border-background shadow-sm"
              style={{ background: c.hex }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{c.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {teeth.length > 0 ? teeth.join(', ') : 'No teeth assigned'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Arch + Tooth ───────────────────────────────────────────────────────────

/**
 * Tooth that the midline IPR slot anchors on, per row. In FDI numbering
 * the upper-left half starts at 21 and the lower-left at 31, so those
 * are the natural "right side" anchors when we render the slot between
 * the two halves of an arch.
 */
const MIDLINE_ANCHOR: Record<'upper' | 'lower', number> = {
  upper: 21,
  lower: 31,
};

/**
 * Pretty-print an IPR slot as "between X and Y". The slot is keyed by
 * the right-hand anchor in render order; the left-hand neighbour is
 * the previous element in the array, OR the last tooth of the
 * opposite-half array when crossing the midline.
 */
function neighbourTooth(
  anchor: number,
  upperRight: readonly number[],
  upperLeft: readonly number[],
  lowerRight: readonly number[],
  lowerLeft: readonly number[],
): number | undefined {
  for (const arr of [upperRight, upperLeft, lowerRight, lowerLeft]) {
    const i = arr.indexOf(anchor);
    if (i > 0) return arr[i - 1];
  }
  // Midline crossing: anchor is first element of its half.
  if (anchor === MIDLINE_ANCHOR.upper) return upperRight[upperRight.length - 1];
  if (anchor === MIDLINE_ANCHOR.lower) return lowerRight[lowerRight.length - 1];
  return undefined;
}

function Arch({
  row,
  left,
  right,
  assignments,
  activeTooth,
  activeIpr,
  disabled,
  iprValues,
  iprNotes,
  onToothClick,
  onIprClick,
}: {
  row: 'upper' | 'lower';
  left: readonly number[];
  right: readonly number[];
  assignments: Map<number, ToothInstructionType>;
  activeTooth: number | null;
  activeIpr: number | null;
  disabled?: boolean;
  iprValues?: Map<number, string>;
  iprNotes?: Map<number, string>;
  onToothClick: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  /** Optional — when omitted the slots become read-only (no popup). */
  onIprClick?: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  // Render rules for the IPR layer:
  //   • If `iprValues` is provided (even when read-only), show the
  //     populated slots — this is what the doctor sees: the planner-set
  //     IPR amounts as purple bars between teeth.
  //   • Empty / dotted placeholder slots ONLY render when an editor
  //     handler is attached (admin/designer in per-tooth mode). Doctors
  //     don't need the "click here to add" hints cluttering the arch.
  const showFilledSlots = !!iprValues;
  const showEmptyPlaceholders = !!onIprClick;
  const midline = MIDLINE_ANCHOR[row];
  const midlineValue = iprValues?.get(midline);
  const midlineNote = iprNotes?.get(midline);
  // Render the midline slot if it has EITHER an IPR mm value OR a
  // stripping note — previously only checked the mm side, so a
  // stripping-only entry was invisible across the midline.
  const midlineShouldRender =
    showEmptyPlaceholders ||
    (showFilledSlots && (!!midlineValue || !!midlineNote));
  // Tooth that sits on the left side of the midline slot — last entry
  // of the "left half" array (e.g. 11 for upper, 41 for lower).
  const midlineLeftNeighbour = left[left.length - 1];

  const renderHalf = (teeth: readonly number[]) => (
    <div
      className={cn(
        'flex justify-between gap-0.5',
        row === 'upper' ? 'items-end' : 'items-start',
      )}
    >
      {teeth.map((n, idx) => {
        const next = teeth[idx + 1];
        const slotValue =
          idx < teeth.length - 1 ? iprValues?.get(next) : undefined;
        const slotNote =
          idx < teeth.length - 1 ? iprNotes?.get(next) : undefined;
        // Render a non-midline slot when either field is populated —
        // mirrors the midlineShouldRender check above so a stripping-
        // only entry on any contact stays visible.
        const slotShouldRender =
          idx < teeth.length - 1 &&
          (showEmptyPlaceholders ||
            (showFilledSlots && (!!slotValue || !!slotNote)));
        return (
          <Fragment key={n}>
            <ToothButton
              toothNumber={n}
              row={row}
              mirrored={MIRRORED.has(n)}
              type={assignments.get(n)}
              active={activeTooth === n}
              disabled={disabled}
              onClick={onToothClick}
            />
            {/* IPR slot between this tooth and the next one. The next
                tooth (teeth[idx + 1]) anchors the slot's storage key. */}
            {slotShouldRender && (
              <IprSlot
                toothNumber={next}
                neighbour={n}
                row={row}
                value={slotValue}
                note={slotNote}
                active={activeIpr === next}
                disabled={disabled || !onIprClick}
                onClick={onIprClick}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );

  // Render the two halves side-by-side with the midline IPR slot
  // sandwiched between them when applicable. This is what enables IPR
  // between teeth 11–21 (upper) and 41–31 (lower) — previously the
  // CSS grid hard-split the arch into two columns with no element
  // between, so the midline contact was the only one without a slot.
  return (
    <div className="flex items-stretch gap-x-1 sm:gap-x-2">
      <div className="flex-1">{renderHalf(left)}</div>
      <div
        className={cn(
          'flex shrink-0 items-center',
          row === 'upper' ? 'items-end pb-1' : 'items-start pt-1',
        )}
      >
        {midlineShouldRender ? (
          <IprSlot
            toothNumber={midline}
            neighbour={midlineLeftNeighbour}
            row={row}
            value={midlineValue}
            note={midlineNote}
            active={activeIpr === midline}
            disabled={disabled || !onIprClick}
            onClick={onIprClick}
          />
        ) : (
          // Keep a fixed spacer width so the two halves stay aligned
          // even when the midline slot isn't rendered.
          <span className="block w-2" aria-hidden />
        )}
      </div>
      <div className="flex-1">{renderHalf(right)}</div>
    </div>
  );
}

type ToothButtonProps = {
  toothNumber: number;
  row: 'upper' | 'lower';
  mirrored: boolean;
  type?: ToothInstructionType;
  active?: boolean;
  disabled?: boolean;
  onClick: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
};

const ToothButton = memo(
  function ToothButton({
    toothNumber,
    row,
    mirrored,
    type,
    active,
    disabled,
    onClick,
  }: ToothButtonProps) {
    const color = type ? COLOR_BY_TYPE.get(type) : undefined;
    // Normalise the host viewBox to "0 0 w h" — some source teeth (17, 27,
    // 37, 47) have content drawn far from the SVG origin (min-x ≈ 22.5).
    // Keeping the raw viewBox would push the <use> at (0, 0) outside the
    // visible viewport and the tooth would silently fail to render.
    // The <symbol> keeps its original viewBox so its content still scales
    // correctly into the <use>'s 0..w / 0..h box.
    const viewBox = useMemo(() => {
      const raw = TOOTH_VIEWBOXES[toothNumber];
      if (!raw) return '0 0 11 22';
      const parts = raw.split(/\s+/);
      return `0 0 ${parts[2]} ${parts[3]}`;
    }, [toothNumber]);

    const style = useMemo<CSSProperties>(
      () =>
        ({
          '--tooth-color': color?.hex ?? DEFAULT_TOOTH,
          '--tooth-outline': color?.outline ?? DEFAULT_OUTLINE,
          transformOrigin: row === 'upper' ? 'bottom center' : 'top center',
        }) as CSSProperties,
      [color?.hex, color?.outline, row],
    );

    const handleClick = useCallback(
      (e: ReactMouseEvent<HTMLButtonElement>) => onClick(toothNumber, e),
      [onClick, toothNumber],
    );

    // The label chip — combines the FDI number with the optional short
    // instruction code so the number is ALWAYS visible (replacing the
    // earlier overlap-prone corner badge).
    const labelChip = (
      <span
        className={cn('odo-chip', color && 'odo-chip-on')}
        style={color ? { background: color.hex } : undefined}
      >
        <span className="odo-chip-num">{toothNumber}</span>
        {color && <span className="odo-chip-sep" aria-hidden />}
        {color && <span className="odo-chip-code">{color.short}</span>}
      </span>
    );

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        aria-label={`Tooth ${toothNumber}${color ? ` — ${color.label}` : ''}`}
        aria-pressed={active}
        data-tooth={toothNumber}
        data-active={active ? 'true' : undefined}
        className={cn(
          'odo-tooth',
          row === 'upper' ? 'odo-tooth-upper' : 'odo-tooth-lower',
          mirrored && 'odo-tooth-mirrored',
        )}
        style={style}
      >
        {row === 'upper' && labelChip}

        <svg
          className="odo-glyph"
          viewBox={viewBox}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
          focusable="false"
        >
          <use href={`${SPRITE_URL}#tooth-${toothNumber}`} />
        </svg>

        {row === 'lower' && labelChip}
      </button>
    );
  },
);

// ── IPR slot (purple bar between two adjacent teeth) ───────────────────────

type IprSlotProps = {
  /** Anchor tooth on the right side of the contact. */
  toothNumber: number;
  /** Anchor tooth on the left side of the contact — used for labelling. */
  neighbour?: number;
  row: 'upper' | 'lower';
  value?: string;
  /** Optional stripping value rendered in muted gray next to the mm value. */
  note?: string;
  active?: boolean;
  disabled?: boolean;
  /** Omitted in read-only mode (doctor's view). The slot renders the
   *  filled bar + mm label but doesn't open the editor popup on click. */
  onClick?: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
};

const IprSlot = memo(function IprSlot({
  toothNumber,
  neighbour,
  row,
  value,
  note,
  active,
  disabled,
  onClick,
}: IprSlotProps) {
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => onClick?.(toothNumber, e),
    [onClick, toothNumber],
  );
  const hasValue = !!value && value.trim().length > 0;
  const hasNote = !!note && note.trim().length > 0;
  // Read-only slots (no onClick) should not be focusable as actionable
  // controls and should not appear pressable — they're a data display.
  const readOnly = !onClick;

  // Human-readable "between X and Y" label — falls back to "tooth N" if
  // we don't know the neighbour for some reason (defensive — shouldn't
  // happen in practice given Arch always supplies it).
  const contactLabel = neighbour
    ? `between ${neighbour} and ${toothNumber}`
    : `tooth ${toothNumber}`;

  return (
    <button
      type="button"
      disabled={disabled || readOnly}
      onClick={readOnly ? undefined : handleClick}
      aria-label={
        readOnly
          ? `IPR ${value} mm ${contactLabel}`
          : hasValue
            ? `Edit IPR ${value} mm — ${contactLabel}`
            : `Add IPR ${contactLabel}`
      }
      aria-pressed={readOnly ? undefined : active}
      data-active={active ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
      className={cn(
        'odo-ipr',
        row === 'upper' ? 'odo-ipr-upper' : 'odo-ipr-lower',
        // Slot has CONTENT (either an IPR mm value OR a stripping note,
        // or both) → use the filled-purple-bar style so it's visually
        // distinct from an empty placeholder slot.
        (hasValue || hasNote) && 'odo-ipr-on',
        readOnly && 'odo-ipr-readonly',
      )}
      title={(() => {
        if (readOnly && (hasValue || hasNote)) {
          const parts: string[] = [];
          if (hasValue) parts.push(`IPR ${value} mm`);
          if (hasNote) parts.push(`stripping ${note}`);
          return `${parts.join(' · ')} · ${contactLabel}`;
        }
        if (hasValue || hasNote) {
          const parts: string[] = [];
          if (hasValue) parts.push(`IPR ${value} mm`);
          if (hasNote) parts.push(`stripping ${note}`);
          return `Edit ${parts.join(' · ')} — ${contactLabel}`;
        }
        return `Click to add IPR ${contactLabel}`;
      })()}
    >
      <span className="odo-ipr-bar" aria-hidden />
      {/* Render the label whenever EITHER the IPR mm or the stripping
          note is set. The previous gate (only `hasValue`) hid the
          stripping pill when the planner entered just a stripping
          number with no mm reduction. */}
      {(hasValue || hasNote) && (
        <span className="odo-ipr-label">
          {hasNote && <span className="odo-ipr-note">{note}</span>}
          {hasValue && <span className="odo-ipr-value">{value}</span>}
        </span>
      )}
    </button>
  );
});

// ── Popover ────────────────────────────────────────────────────────────────

function ColorPopover({
  tooth,
  anchorX,
  anchorY,
  currentType,
  colors,
  onPick,
  onClose,
}: {
  tooth: number;
  anchorX: number;
  anchorY: number;
  currentType?: ToothInstructionType;
  /** Subset of COLORS to show — controls movement vs. attachments-only. */
  colors: readonly ColorEntry[];
  onPick: (type: ToothInstructionType | null) => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });

  useEffect(() => {
    // Ignore the click that opened the popover; only close on later clicks.
    let armed = false;
    const id = window.setTimeout(() => {
      armed = true;
    }, 0);
    const onDocClick = (e: MouseEvent) => {
      if (!armed) return;
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  // Position once mounted.
  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    const left = Math.min(Math.max(margin, anchorX - rect.width / 2), maxLeft);
    const top = Math.min(Math.max(margin, anchorY), maxTop);
    setPos({ left, top });
  }, [anchorX, anchorY]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`Pick instruction color for tooth ${tooth}`}
      className="odo-popover fixed z-[1000] rounded-xl border bg-popover p-3 shadow-xl outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>
          Tooth <span className="text-foreground">{tooth}</span>
        </span>
        {currentType && (
          <span className="text-muted-foreground">
            {COLOR_BY_TYPE.get(currentType)?.label}
          </span>
        )}
      </div>
      <div
        className={cn(
          'grid gap-2',
          // Single-colour attachments mode: collapse the swatch grid to
          // a single wide button so the picker looks intentional instead
          // of weirdly sparse.
          colors.length === 1 ? 'grid-cols-1' : 'grid-cols-4',
        )}
      >
        {colors.map((c) => {
          const active = c.type === currentType;
          return (
            <button
              key={c.type}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c.type)}
              title={c.label}
              aria-label={c.label}
              className={cn('odo-swatch', active && 'odo-swatch-active')}
              style={{ background: c.hex }}
            >
              {active && <Check className="h-4 w-4 text-white drop-shadow" />}
              <span className="odo-swatch-tip">{c.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(null)}
        disabled={!currentType}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        Clear
      </button>
    </div>,
    document.body,
  );
}

// ── IPR Popover ────────────────────────────────────────────────────────────

function IprPopover({
  tooth,
  anchorX,
  anchorY,
  currentValue,
  currentNote,
  onCommit,
  showStripping,
  onClose,
}: {
  tooth: number;
  anchorX: number;
  anchorY: number;
  currentValue?: string;
  /** Existing stripping value (note column). */
  currentNote?: string;
  /**
   * Single combined commit — emits BOTH the IPR mm value and the
   * optional stripping note in one callback so the parent fires one
   * persist mutation instead of two. Two separate callbacks raced
   * the backend's delete+createMany transaction and caused P2002.
   */
  onCommit: (payload: { value: string | null; note: string | null }) => void;
  /** Whether to show the second "Stripping" input field. */
  showStripping?: boolean;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });
  const [draft, setDraft] = useState(currentValue ?? '0.2');
  const [noteDraft, setNoteDraft] = useState(currentNote ?? '');

  useEffect(() => {
    let armed = false;
    const id = window.setTimeout(() => {
      armed = true;
    }, 0);
    const onDocClick = (e: MouseEvent) => {
      if (!armed) return;
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    const margin = 8;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    const left = Math.min(Math.max(margin, anchorX - rect.width / 2), maxLeft);
    const top = Math.min(Math.max(margin, anchorY), maxTop);
    setPos({ left, top });
  }, [anchorX, anchorY]);

  if (typeof window === 'undefined') return null;

  const handleConfirm = () => {
    const trimmed = draft.trim();
    const trimmedNote = noteDraft.trim();
    // Build one payload that carries BOTH fields so the parent
    // persists in a single mutation. Either field can independently
    // be null — clearing the IPR while keeping the stripping note,
    // or vice versa, is a legal state.
    if (!trimmed) {
      onCommit({
        value: null,
        // If stripping isn't shown, never send a note value at all
        // (`showStripping=false` means the parent doesn't store notes).
        note: showStripping ? (trimmedNote.length > 0 ? trimmedNote : null) : null,
      });
      return;
    }
    // Clamp the IPR mm to a sane range — 0.1 to 1.0 mm is typical;
    // we accept up to 2 mm to give the planner some headroom.
    const num = Number(trimmed);
    const valueOut =
      Number.isFinite(num) && num >= 0 && num <= 2 ? num.toString() : trimmed;
    onCommit({
      value: valueOut,
      note: showStripping ? (trimmedNote.length > 0 ? trimmedNote : null) : null,
    });
  };

  // Tooth labelling: figure out the left-side neighbour for a friendlier
  // "between X and Y" header. We can re-derive it from FDI math because
  // we always anchor on the right tooth of the contact.
  //   • 21 → 11 (midline upper)
  //   • 31 → 41 (midline lower)
  //   • 17 → 18, 16 → 17, … (within the upper-right half)
  //   • 22 → 23 visually but the anchor is on the LEFT side of the
  //     contact in this case; we still want "21 and 22" — i.e. neighbour
  //     is the FDI predecessor in the same half. Encoded via the table
  //     below to keep the math obvious.
  const neighbour = (() => {
    if (tooth === 21) return 11;
    if (tooth === 31) return 41;
    if (tooth >= 12 && tooth <= 18) return tooth + 1; // within UR (11..18 chain runs 11,12,…,18)
    if (tooth >= 22 && tooth <= 28) return tooth - 1; // within UL (21,22,…,28)
    if (tooth >= 42 && tooth <= 48) return tooth + 1; // within LR
    if (tooth >= 32 && tooth <= 38) return tooth - 1; // within LL
    return undefined;
  })();
  const contactLabel = neighbour
    ? `Between ${neighbour} and ${tooth}`
    : `Tooth ${tooth}`;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`Set IPR amount ${contactLabel}`}
      className="odo-popover fixed z-[1000] w-[240px] rounded-xl border bg-popover p-3 shadow-xl outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        IPR · {contactLabel}
      </div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Reduction
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          min="0"
          max="2"
          inputMode="decimal"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">mm</span>
      </div>
      {/* Stripping column — only shown when the parent opted in via
          `showStripping`. Rendered in a muted style to communicate
          "secondary / optional" and to mirror the gray styling used
          on the slot display. */}
      {showStripping && (
        <>
          <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Stripping
          </label>
          <Input
            type="text"
            inputMode="decimal"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="e.g. 11"
            className="h-9 bg-muted/40 text-muted-foreground"
          />
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Clear wipes BOTH fields together in a single emit so the
          // parent does one persist mutation, matching the Save path.
          onClick={() => onCommit({ value: null, note: null })}
          disabled={!currentValue && !currentNote}
          className="gap-1"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
        <Button type="button" size="sm" onClick={handleConfirm} className="gap-1">
          <Check className="h-3 w-3" />
          Save
        </Button>
      </div>
    </div>,
    document.body,
  );
}

// ── Scoped styles ──────────────────────────────────────────────────────────
// Co-located because the perf rules below (`contain`, `will-change`, GPU
// `translate3d`) form the perf contract of this component — easy to lose if
// they migrate to a global stylesheet.

const ODONTOGRAM_CSS = /* css */ `
.odo-tooth {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 2px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  position: relative;
  outline: none;
  /* Scope style + paint to this tooth — a color change only repaints here. */
  contain: layout style paint;
  /* GPU-promote the hover transform — no per-frame paint on the SVG. */
  will-change: transform;
  transform: translateZ(0);
  transition:
    transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 180ms cubic-bezier(0.4, 0, 0.2, 1),
    background 180ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.odo-tooth:hover {
  transform: translate3d(0, -3px, 0) scale(1.06);
  filter: drop-shadow(0 6px 10px rgba(15, 23, 42, 0.18));
}
.odo-tooth-lower:hover {
  transform: translate3d(0, 3px, 0) scale(1.06);
}
.odo-tooth:focus-visible {
  border-color: var(--primary, #6366f1);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}
.odo-tooth[data-active="true"] {
  background: rgba(99, 102, 241, 0.06);
  border-color: rgba(99, 102, 241, 0.45);
}
.odo-tooth:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.odo-tooth:active {
  transition-duration: 90ms;
}

.odo-glyph {
  display: block;
  width: 100%;
  height: 96px;
  pointer-events: none;
}
.odo-tooth-mirrored .odo-glyph {
  transform: scaleX(-1);
}

/* The label chip: number is ALWAYS visible; colour state is communicated
   by filling the chip with the instruction colour and appending the short
   code. No overlap, no hidden numbers. */
.odo-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  min-height: 16px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: rgb(110, 120, 135);
  background: transparent;
  border: 1px solid transparent;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  white-space: nowrap;
}
.odo-chip-on {
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  /* Subtle pop when colour is applied — confirms the action. */
  animation: odo-chip-pop 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.odo-chip-num { font-variant-numeric: tabular-nums; }
.odo-chip-sep {
  display: inline-block;
  width: 1px;
  height: 8px;
  background: rgba(255, 255, 255, 0.55);
}
.odo-chip-code {
  font-size: 9px;
  letter-spacing: 0.04em;
}
@keyframes odo-chip-pop {
  0%   { transform: scale(0.85); }
  60%  { transform: scale(1.06); }
  100% { transform: scale(1); }
}

/* Popover */
.odo-popover {
  animation: odo-pop-in 120ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top center;
  /* Keep the popover content on the GPU layer so opening is instant. */
  will-change: transform, opacity;
  max-width: calc(100vw - 16px);
}
@keyframes odo-pop-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Swatches */
.odo-swatch {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.odo-swatch:hover {
  transform: scale(1.1);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.15);
}
.odo-swatch-active {
  border-color: var(--primary, #6366f1);
}
.odo-swatch-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgb(30, 41, 59);
  color: #fff;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 10px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.odo-swatch:hover .odo-swatch-tip {
  opacity: 1;
}

/* Responsive scaling — keep the chart legible and the targets tappable. */
@media (max-width: 640px) {
  .odo-glyph { height: 72px; }
  .odo-chip { padding: 2px 5px; font-size: 9px; }
  .odo-swatch { width: 44px; height: 44px; }
  .odo-popover { padding: 10px; }
}
@media (max-width: 480px) {
  .odo-glyph { height: 60px; }
}
@media (min-width: 1280px) {
  .odo-glyph { height: 110px; }
}

/* ── IPR slot (purple bar between adjacent teeth) ─────────────────────────
   Visually evokes the clinical reality: a thin strip of enamel reduction
   between two teeth. Purple was picked specifically because it has zero
   conflict with the 4 color-instruction hues (blue/red/green/sky) and
   reads instantly as a separate semantic layer.

   Empty slots show a subtle dotted hint on hover only — they don't compete
   for attention with the tooth icons when nothing is set. Filled slots
   show a saturated purple bar with the mm value floating beside it.
*/
.odo-ipr {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  width: 14px;
  min-height: 96px;
  padding: 0 2px;
  margin: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  contain: layout style paint;
  outline: none;
  transition: transform 160ms ease;
}
.odo-ipr-upper { justify-content: flex-end; padding-bottom: 8px; }
.odo-ipr-lower { justify-content: flex-start; padding-top: 8px; }
.odo-ipr:hover { transform: scale(1.06); }
.odo-ipr:disabled { cursor: default; opacity: 0.55; }
.odo-ipr:focus-visible .odo-ipr-bar {
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.35);
}
/* Read-only slots (doctor's view) — show the data, don't suggest it's
   actionable. No hover transform, no disabled-fade, default cursor. */
.odo-ipr-readonly { cursor: default; opacity: 1; }
.odo-ipr-readonly:hover { transform: none; }
.odo-ipr-readonly:disabled { opacity: 1; }
.odo-ipr-readonly .odo-ipr-bar { border-style: solid; }

.odo-ipr-bar {
  display: block;
  width: 4px;
  height: 32px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.12);
  border: 1px dashed rgba(168, 85, 247, 0.45);
  transition: background 180ms ease, border-color 180ms ease, height 180ms ease;
}
.odo-ipr:hover .odo-ipr-bar {
  background: rgba(168, 85, 247, 0.28);
  border-color: rgba(168, 85, 247, 0.75);
}
.odo-ipr-on .odo-ipr-bar {
  /* Purple = #a855f7. Saturated bar makes set values immediately legible. */
  width: 6px;
  height: 56px;
  background: #a855f7;
  border: 1px solid #7c3aed;
  border-style: solid;
  box-shadow: 0 1px 6px rgba(139, 92, 246, 0.45);
}
.odo-ipr-on:hover .odo-ipr-bar {
  background: #9333ea;
}

.odo-ipr-label {
  position: absolute;
  /* On the upper arch, the label sits above the bar; on the lower arch,
     below. Centered horizontally on the bar's anchor button. */
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  padding: 1px 5px;
  background: #7c3aed;
  color: #fff;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  box-shadow: 0 1px 4px rgba(124, 58, 237, 0.45);
  white-space: nowrap;
  pointer-events: none;
}
.odo-ipr-upper .odo-ipr-label {
  bottom: calc(100% - 16px);
}
.odo-ipr-lower .odo-ipr-label {
  top: calc(100% - 16px);
}

/* Inside the label pill, the primary IPR mm value sits next to the
   optional "stripping" note. The note is rendered in muted gray to
   communicate that it's secondary information — the dentist's eye
   should land on the mm value first. */
.odo-ipr-value {
  display: inline-block;
  font-weight: 700;
  color: inherit;
}
.odo-ipr-note {
  display: inline-block;
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18); /* slate-400 / 18% */
  color: rgba(71, 85, 105, 0.95);         /* slate-600 */
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.2px;
}
.odo-ipr-on .odo-ipr-note {
  /* Slightly more contrast when the slot is filled — the purple label
     surface tends to swallow muted greys otherwise. */
  background: rgba(241, 245, 249, 0.85); /* slate-100 / 85% */
  color: rgba(71, 85, 105, 0.95);
}

@media (max-width: 640px) {
  .odo-ipr { width: 10px; min-height: 72px; }
  .odo-ipr-on .odo-ipr-bar { height: 44px; width: 5px; }
  .odo-ipr-label { font-size: 8px; min-width: 22px; padding: 0 4px; }
}
@media (max-width: 480px) {
  .odo-ipr { width: 8px; min-height: 60px; }
}

/* Respect reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .odo-tooth,
  .odo-tooth:hover,
  .odo-tooth-lower:hover,
  .odo-chip,
  .odo-chip-on,
  .odo-swatch,
  .odo-swatch:hover,
  .odo-ipr,
  .odo-ipr:hover,
  .odo-popover {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}
`;
