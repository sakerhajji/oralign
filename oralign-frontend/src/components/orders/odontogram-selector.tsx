'use client';

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { Check, Info, Palette, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArchTreatment, ToothInstruction, ToothInstructionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { IndeterminateBar, Progress } from '@/components/ui/progress';
import {
  prefetchToothArt,
  toothArtKey,
  useToothArtReady,
  useToothArtUrls,
  useToothSpriteProgress,
} from './tooth-art';
import { TOOTH_VIEWBOXES } from './tooth-viewboxes';
import {
  LOWER_LEFT,
  LOWER_RIGHT,
  UPPER_LEFT,
  UPPER_RIGHT,
} from './wizard/tooth-contacts';
import { useT } from '@/lib/i18n/lang-context';

// ── Layout (FDI numbering, render order: see tooth-contacts) ────────────────
const MIRRORED = new Set<number>([...UPPER_LEFT, ...LOWER_RIGHT]);
const ALL_TEETH = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT];

/**
 * Sprite symbol each tooth renders. The sprite ships only the 16 right-side
 * symbols (11–18, 31–38): the artwork for every mirrored pair was
 * byte-identical, and the left-side teeth are ALREADY flipped with CSS
 * `scaleX(-1)` (the MIRRORED set above) — so tooth 21 rendering symbol
 * #tooth-11 produces the exact same pixels while the sprite file, its
 * parse time and the tooth images built from it are all halved.
 */
function canonicalSpriteTooth(toothNumber: number): number {
  if (toothNumber >= 21 && toothNumber <= 28) return toothNumber - 10; // 21→11 … 28→18
  if (toothNumber >= 41 && toothNumber <= 48) return toothNumber - 10; // 41→31 … 48→38
  return toothNumber;
}

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
  {
    // Teal swatch — a tooth that needs an aligner cutout (elastic hook,
    // button). Not in any mode's palette: only callers that pass it in
    // `palette` (the supplemental request form) can mark it.
    type: ToothInstructionType.PRECISION_CUT,
    label: 'Cutout',
    short: 'CUT',
    hex: '#0f766e', // teal-700
    outline: '#14b8a6',
  },
] as const;

const DEFAULT_TOOTH = '#f1e8d4';
const DEFAULT_OUTLINE = '#f3eeea';
const COLOR_BY_TYPE = new Map<ToothInstructionType, ColorEntry>(
  COLORS.map((c) => [c.type, c]),
);

/**
 * Surface the chart is drawn for; picks the default editable palette.
 * 'movement'    — order wizard / order detail: the four doctor marks
 *                 (No Attachments / Do Not Move / No IPR / Extract).
 * 'attachments' — treatment attachment editor: the pink ATTACHMENT only.
 * 'treatment'   — full planner odontogram: doctor marks + ATTACHMENT.
 */
export type OdontogramMode = 'movement' | 'attachments' | 'treatment';

const DOCTOR_PALETTE = [
  ToothInstructionType.NO_ATTACHMENTS,
  ToothInstructionType.DO_NOT_MOVE,
  ToothInstructionType.NO_IPR,
  ToothInstructionType.EXTRACT,
] as const;

const MODE_PALETTES: Record<OdontogramMode, readonly ToothInstructionType[]> = {
  movement: DOCTOR_PALETTE,
  attachments: [ToothInstructionType.ATTACHMENT],
  treatment: [...DOCTOR_PALETTE, ToothInstructionType.ATTACHMENT],
};

/** Contact amounts above this are not normalised by the popover (mm). */
const DEFAULT_CONTACT_MAX_MM = 2;

type Translate = ReturnType<typeof useT>['t'];

/** "Contact 11–21": the contact named by its two teeth, lower number first. */
function contactTitle(
  t: Translate,
  toothA: number,
  toothB: number,
): string {
  return t('orderForm.files.tooth.contact.title', {
    from: Math.min(toothA, toothB),
    to: Math.max(toothA, toothB),
  });
}

/**
 * Ordered, de-duped colours painted on one tooth. `preferEditableFill`
 * decides which layer leads (and so owns the dominant fill): the treatment
 * attachment editor wants its editable ATTACHMENT to win; order surfaces
 * want the doctor marks to lead.
 */
function resolveToothMarks(
  types: ToothInstructionType[] | undefined,
  readonlyTypes: ToothInstructionType[] | undefined,
  preferEditableFill: boolean | undefined,
): ColorEntry[] {
  const editableColors = (types ?? [])
    .map((tp) => COLOR_BY_TYPE.get(tp))
    .filter((c): c is ColorEntry => !!c);
  const readonlyColors = (readonlyTypes ?? [])
    .map((tp) => COLOR_BY_TYPE.get(tp))
    .filter((c): c is ColorEntry => !!c);
  const orderedColors = preferEditableFill
    ? [...editableColors, ...readonlyColors]
    : [...readonlyColors, ...editableColors];
  // De-dupe by type, preserving order.
  const seenTypes = new Set<ToothInstructionType>();
  return orderedColors.filter((c) => {
    if (seenTypes.has(c.type)) return false;
    seenTypes.add(c.type);
    return true;
  });
}

/** Tooth images one glyph draws: the neutral tooth, or one per colour band. */
function glyphArtKeys(toothNumber: number, marks: ColorEntry[]): string[] {
  const symbol = canonicalSpriteTooth(toothNumber);
  if (marks.length === 0) {
    return [toothArtKey(symbol, DEFAULT_TOOTH, DEFAULT_OUTLINE)];
  }
  return marks.map((c) => toothArtKey(symbol, c.hex, c.outline));
}

/**
 * The four order-level doctor instruction types among which EXTRACT is
 * exclusive. Non-extraction marks combine freely; EXTRACT stands alone.
 */
const DOCTOR_MARK_TYPES = new Set<ToothInstructionType>(DOCTOR_PALETTE);

/**
 * Build the tooth → marks[] map for one instruction list, restricted to
 * `visibleTypes`. A tooth can carry SEVERAL non-extraction marks; EXTRACT
 * is exclusive, so an extract-bearing tooth is collapsed to `[EXTRACT]`
 * (defends against legacy rows where extract co-existed with a mark).
 * Marks are ordered by the canonical COLORS sequence for stable render.
 */
function buildMarkMap(
  items: ToothInstruction[],
  visibleTypes: Set<ToothInstructionType>,
): Map<number, ToothInstructionType[]> {
  const map = new Map<number, ToothInstructionType[]>();
  for (const item of items) {
    if (!visibleTypes.has(item.type)) continue;
    const arr = map.get(item.toothNumber);
    if (arr) {
      if (!arr.includes(item.type)) arr.push(item.type);
    } else {
      map.set(item.toothNumber, [item.type]);
    }
  }
  for (const [tooth, arr] of map) {
    if (arr.includes(ToothInstructionType.EXTRACT)) {
      map.set(tooth, [ToothInstructionType.EXTRACT]);
    } else {
      map.set(
        tooth,
        COLORS.filter((c) => arr.includes(c.type)).map((c) => c.type),
      );
    }
  }
  return map;
}

/**
 * Enforce "Extract is exclusive" on a raw instruction list: for any tooth
 * flagged EXTRACT, drop the other doctor marks (No Attachments / Do Not
 * Move / No IPR) while leaving unrelated instructions (IPR values,
 * attachments) intact. Call this before persisting an order's tooth
 * instructions so an invalid extract-plus-mark combination never saves.
 */
export function enforceExtractExclusiveInstructions(
  items: ToothInstruction[],
): ToothInstruction[] {
  const extractTeeth = new Set(
    items
      .filter((i) => i.type === ToothInstructionType.EXTRACT)
      .map((i) => i.toothNumber),
  );
  if (extractTeeth.size === 0) return items;
  return items.filter((i) => {
    if (!extractTeeth.has(i.toothNumber)) return true;
    if (i.type === ToothInstructionType.EXTRACT) return true;
    return !DOCTOR_MARK_TYPES.has(i.type);
  });
}

// ── Settled-width hook ──────────────────────────────────────────────────────

/**
 * Pin the chart to its container's SETTLED width so layout-animating
 * ancestors don't thrash it.
 *
 * Why: the dashboard sidebar collapse animates the main content's width
 * for 200 ms (shadcn Sidebar transitions `width` on its gap element).
 * With a fluid chart, EVERY frame of that animation reflowed the arch and
 * re-rasterized all 32 tooth SVGs (up to 4 stacked glyphs per marked
 * tooth) — the source of the sidebar jank on odontogram pages.
 *
 * How: observe the scroll container with a ResizeObserver and expose its
 * content-box width, but only AFTER it has stopped changing for
 * `SETTLE_MS`. The inner chart takes that value as a fixed pixel width:
 * during the sidebar animation the chart keeps its previous geometry
 * (the `overflow-x-auto` wrapper absorbs the temporary mismatch), then
 * re-lays-out exactly once when the animation ends. The first observation
 * is applied un-debounced; it may flush a frame after first paint, but the
 * pixel value equals the fluid width so nothing visibly changes.
 */
const SETTLE_MS = 150;

function useSettledWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number | undefined,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    let timer: number | undefined;
    let first = true;
    const observer = new ResizeObserver((entries) => {
      // contentRect excludes padding — exactly the width the inner
      // chart would naturally take as a block child. FLOOR, not round:
      // rounding up by half a pixel would make the pinned chart wider
      // than its container, and on classic (Windows) scrollbars that
      // sub-pixel overflow shows a persistent horizontal scrollbar.
      // Flooring worst-cases as an invisible <1px centered gap.
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (!next) return;
      if (first) {
        first = false;
        setWidth(next);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setWidth((prev) => (prev === next ? prev : next));
      }, SETTLE_MS);
    });

    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return [ref, width];
}

// ── Component ──────────────────────────────────────────────────────────────

// memo matters here: the wizard + order pages keep ALL their state at the
// page root, so every keystroke / dialog toggle / query settle anywhere on
// the page re-renders the host. Without the wrap each of those re-ran this
// whole component (two arches, legend, badge strip) even though nothing
// odontogram-related changed. Callers pass stable/memoized props.
export const OdontogramSelector = memo(function OdontogramSelector({
  value,
  onChange,
  disabled,
  saving,
  iprValues,
  iprNotes,
  onIprChange,
  readonlyValue,
  mode = 'movement',
  palette,
  markLabel,
  defaultShowLegend = true,
  hideLegendToggle,
  contactUnitLabel,
  contactMaxMm = DEFAULT_CONTACT_MAX_MM,
  validateContactAmount,
  visibleArch = ArchTreatment.BOTH,
  title,
  subtitle,
}: {
  value: ToothInstruction[];
  onChange: (value: ToothInstruction[]) => void;
  disabled?: boolean;
  /**
   * True while a tooth/IPR change is being persisted. Renders a small
   * non-blocking spinner next to the heading (with an accessible label)
   * so the user knows the save is in flight — the parent usually also
   * passes `disabled` during the same window to prevent double submits.
   */
  saving?: boolean;
  /**
   * Optional per-tooth IPR values (mm as a string). When provided together
   * with `onIprChange`, the odontogram renders clickable purple bars
   * between adjacent teeth in each arch half AND across the midline
   * (slots anchored on tooth 21 and 31). The key is the "right tooth
   * in render order" — i.e. the slot to the LEFT of tooth N belongs to N.
   * Tooth 18 and 48 cannot have IPR (they're at the start of their
   * respective halves). When omitted, the IPR layer is hidden —
   * preserves the existing wizard / read-only behaviour.
   *
   * The layer works in every mode: any between-teeth amount in mm (IPR
   * performed, residual space…) can use it — see `contactUnitLabel`.
   */
  iprValues?: Map<number, string>;
  /**
   * Optional per-contact STEP values persisted alongside the IPR amount.
   * Rendered in the purple chip next to the primary yellow IPR mm label.
   * Same key as `iprValues`.
   */
  iprNotes?: Map<number, string>;
  /**
   * Combined setter for an IPR / STEP contact. Carries BOTH
   * tooth numbers explicitly — IPR is between TWO teeth and the
   * backend now stores it that way (TreatmentPlanIpr keyed on
   * fromTooth + toTooth). The parent uses this signature to call
   * `treatmentPlansService.upsertIpr` / `removeIpr` directly.
   *
   * Pass `null` for `value` (and optionally `note`) to clear the
   * contact — the parent translates that into a DELETE.
   */
  onIprChange?: (
    fromTooth: number,
    toTooth: number,
    payload: { value: string | null; note: string | null },
  ) => void;
  /**
   * Tooth instructions painted as a READ-ONLY background layer. The
   * treatment-plan editor passes the doctor's order colours through
   * this prop so they paint INLINE on the same odontogram the planner
   * uses for attachments — no separate "reference" panel, the doctor's
   * prescription context lives right where the work happens.
   *
   * Rendering rules:
   *   • If a tooth has only a readonly entry → painted with the doctor's
   *     colour (blue / red / green / orange).
   *   • If a tooth has only an editable ATTACHMENT → painted pink.
   *   • If a tooth has BOTH → painted with the doctor's colour as the
   *     primary fill PLUS a small pink corner dot signalling the
   *     attachment. Both signals visible at once.
   *
   * The picker palette stays restricted to the mode's `visibleColors`
   * regardless of what readonlyValue contains — the planner cannot
   * edit the doctor's prescription from this surface.
   */
  readonlyValue?: ToothInstruction[];
  /** Surface the chart is drawn for (default palette, copy, legend). */
  mode?: OdontogramMode;
  /**
   * Editable colour types, replacing the mode's palette. Pass a stable
   * (module-level) array: the chart's memoised layers key on it.
   *   • one type → a tooth click / Enter / Space toggles that mark
   *     directly, no colour popover;
   *   • empty    → teeth are not selectable (e.g. a contacts-only chart).
   */
  palette?: readonly ToothInstructionType[];
  /**
   * Label of the editable mark in the badge strip, legend and tooth
   * names, instead of the English colour label. Meant for a one-type
   * palette ("Ne pas bouger", "Découpe"…).
   */
  markLabel?: string;
  /** Whether the colour guide starts open (default true). */
  defaultShowLegend?: boolean;
  /** Hide the "View / Hide color guide" button. */
  hideLegendToggle?: boolean;
  /**
   * Name + unit of the contact amount, e.g. "RIP (mm)" or "Espace (mm)":
   * popover field, slot names and legend row. Default: "IPR (mm)".
   */
  contactUnitLabel?: string;
  /**
   * Upper bound of the contact amount (mm), default 2: the popover input's
   * `max`, and the range it normalises ("0.20" → "0.2"). Values outside it
   * are passed through untouched for the caller's own validation.
   */
  contactMaxMm?: number;
  /**
   * Checks the typed amount before it is committed: a message keeps the
   * popover open and is shown under the field; `null` accepts the value.
   * Pass a stable callback. Without it every amount is committed.
   */
  validateContactAmount?: (raw: string) => string | null;
  /**
   * Arch(es) drawn, default both. A single-arch surface (a request for the
   * upper arch only) hides the other arch, so it cannot be marked.
   */
  visibleArch?: ArchTreatment;
  /** Override the default section heading. */
  title?: string;
  /** Override the default section subheading. */
  subtitle?: string;
}) {
  const { t } = useT();
  const toothSpriteProgress = useToothSpriteProgress();
  const [showLegend, setShowLegend] = useState(defaultShowLegend);
  const [popup, setPopup] = useState<{
    tooth: number;
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [iprPopup, setIprPopup] = useState<{
    /** Anchor / right-side tooth of the contact. Used to look up the
     *  existing value/note in the iprValues/iprNotes Maps. */
    tooth: number;
    /** Left-side tooth — used for the API call (fromTooth on upsert). */
    fromTooth: number;
    x: number;
    y: number;
  } | null>(null);

  // Show the IPR layer whenever values are provided — even if no setter is
  // attached. Read-only viewers (doctor / order-detail read screen) still
  // benefit from seeing where IPR is planned. Clicking is gated separately.
  const iprVisible = !!iprValues;
  const iprEditable = !!onIprChange && !disabled;

  // Freeze the chart's width between resize events so the sidebar
  // collapse animation (which animates the content width for 200 ms)
  // doesn't reflow + re-rasterize the tooth SVGs on every frame.
  const [chartHostRef, chartWidth] = useSettledWidth<HTMLDivElement>();

  // Editable palette: the caller's explicit `palette`, else the mode's
  // (MODE_PALETTES). In COLORS order, so swatches and bands stay stable. A
  // tooth may carry SEVERAL of the non-extraction marks at once; EXTRACT is
  // the only exclusive one (see `toggleMark`).
  const visibleColors = useMemo<readonly ColorEntry[]>(() => {
    const editable = new Set(palette ?? MODE_PALETTES[mode]);
    return COLORS.filter((c) => editable.has(c.type));
  }, [mode, palette]);
  // An explicit one-type palette → a tap toggles it directly; an empty one
  // → static teeth. Mode palettes keep the popover, even the one-colour
  // attachments palette of the plan editor.
  const toggleColor =
    palette && visibleColors.length === 1 ? visibleColors[0] : null;
  const selectable = visibleColors.length > 0;
  // A contacts-only chart (static teeth, editable slots): each slot's hit
  // area may spread over the static teeth next to it (see the CSS).
  const contactsOnly = !selectable && iprEditable;
  const showUpper = visibleArch !== ArchTreatment.LOWER;
  const showLower = visibleArch !== ArchTreatment.UPPER;
  // The planner surfaces always list the doctor's read-only marks and the
  // between-teeth markers in the legend; elsewhere the contact rows show
  // only when the caller edits contacts.
  const plannerLegend = mode === 'treatment' || mode === 'attachments';
  const contactLegendLabel =
    plannerLegend || onIprChange
      ? (contactUnitLabel ?? t('orderForm.files.tooth.legend.iprAmount'))
      : undefined;
  const contactUnit =
    contactUnitLabel ?? t('orderForm.files.tooth.contact.defaultUnit');

  // MULTIPLE instructions per tooth — restricted to the mode's current
  // palette so types that don't belong on this surface stay invisible.
  //
  // A tooth can carry several non-extraction marks at once (No IPR + No
  // Attachments + Do Not Move). EXTRACT is exclusive, so the normaliser
  // below collapses any extract-bearing tooth to `[EXTRACT]` for display
  // (defends against legacy data where extract co-existed with another
  // mark). Marks are ordered by the canonical COLORS sequence so the
  // dominant fill + dot order stay stable across renders.
  //
  // Example: when the order detail page renders the odontogram in
  // 'movement' mode, the value array may STILL contain ATTACHMENT
  // entries written by the planner via the treatment-plan editor. The
  // visibleTypes filter skips any tooth-instruction whose type isn't
  // part of the current mode's palette.
  const visibleTypes = useMemo(
    () => new Set(visibleColors.map((c) => c.type)),
    [visibleColors],
  );
  const assignments = useMemo(
    () => buildMarkMap(value, visibleTypes),
    [value, visibleTypes],
  );

  // Read-only doctor instructions painted as a background layer.
  // Filtered to types that are NOT in the picker's palette so we
  // don't double-paint a tooth that's already in the editable set.
  // Stable Map structure → memoised so a parent passing an array
  // literal each render doesn't churn the ToothButton tree.
  const readonlyAssignments = useMemo(() => {
    if (!readonlyValue) return new Map<number, ToothInstructionType[]>();
    // The read-only doctor layer shows the types NOT in the editable
    // palette (so the treatment editor doesn't double-paint its own
    // attachment marks). Multiple doctor marks per tooth are supported.
    const notEditable = new Set<ToothInstructionType>(
      COLORS.map((c) => c.type).filter((tp) => !visibleTypes.has(tp)),
    );
    return buildMarkMap(readonlyValue, notEditable);
  }, [readonlyValue, visibleTypes]);

  // Every tooth image the chart draws right now. The skeleton stays until
  // all of them have decoded, so the arch appears in one frame. After that
  // first reveal it never comes back: a tooth whose colours change keeps
  // its previous image until the new one is ready (useToothArtUrls).
  const preferEditableFill = mode === 'attachments';
  const artKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const n of ALL_TEETH) {
      const marks = resolveToothMarks(
        assignments.get(n),
        readonlyAssignments.get(n),
        preferEditableFill,
      );
      for (const key of glyphArtKeys(n, marks)) keys.add(key);
    }
    return [...keys].sort();
  }, [assignments, readonlyAssignments, preferEditableFill]);
  const artReady = useToothArtReady(artKeys);
  const [artRevealed, setArtRevealed] = useState(artReady);
  if (artReady && !artRevealed) setArtRevealed(true);
  const toothSpriteReady = artReady || artRevealed;
  // A chart mounted after the sprite was parsed only waits for a few images
  // to decode: no download to report, and a progress strip shown for a
  // frame would push the arch down. The glyph-slot pulse covers it.
  const [spriteParsedAtMount] = useState(toothSpriteProgress === 100);

  // Keep onChange / value / disabled reachable from stable callbacks so
  // ToothButton's memoization actually holds across renders.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const onIprChangeRef = useRef(onIprChange);
  const visibleTypesRef = useRef(visibleTypes);

  useLayoutEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    disabledRef.current = disabled;
    onIprChangeRef.current = onIprChange;
    visibleTypesRef.current = visibleTypes;
  }, [value, onChange, disabled, onIprChange, visibleTypes]);

  // Toggle one mark on a tooth. Non-extraction marks combine freely;
  // EXTRACT is exclusive — selecting it clears the other marks, and while
  // a tooth is flagged EXTRACT no other mark can be added (the popover
  // disables them; this guard is the data-level backstop).
  const toggleMark = useCallback(
    (toothNumber: number, type: ToothInstructionType) => {
      const editableTypes = visibleTypesRef.current;
      const current = valueRef.current;
      // Preserve everything that isn't an editable mark on this tooth
      // (other teeth, IPR values, attachments in other modes, …).
      const others = current.filter(
        (i) => i.toothNumber !== toothNumber || !editableTypes.has(i.type),
      );
      const toothMarks = current
        .filter((i) => i.toothNumber === toothNumber && editableTypes.has(i.type))
        .map((i) => i.type);
      const hasExtract = toothMarks.includes(ToothInstructionType.EXTRACT);

      let next: ToothInstructionType[];
      if (type === ToothInstructionType.EXTRACT) {
        // Toggle extraction. Turning it ON replaces every other mark.
        next = hasExtract ? [] : [ToothInstructionType.EXTRACT];
      } else if (hasExtract) {
        // Blocked — extraction must be removed first.
        return;
      } else {
        next = toothMarks.includes(type)
          ? toothMarks.filter((t) => t !== type)
          : [...toothMarks, type];
      }
      onChangeRef.current([
        ...others,
        ...next.map((t) => ({ toothNumber, type: t })),
      ]);
    },
    [],
  );

  // Remove every editable mark from a tooth (keeps non-editable data).
  const clearTooth = useCallback((toothNumber: number) => {
    const editableTypes = visibleTypesRef.current;
    onChangeRef.current(
      valueRef.current.filter(
        (i) => i.toothNumber !== toothNumber || !editableTypes.has(i.type),
      ),
    );
  }, []);

  const openIprPopup = useCallback(
    (
      fromTooth: number,
      toTooth: number,
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      if (disabledRef.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setIprPopup({
        // Keep `tooth` (anchor / right side) for backward compat with
        // existing rendering. Carry the neighbour for the API call.
        tooth: toTooth,
        fromTooth,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      });
    },
    [],
  );

  const closeIprPopup = useCallback(() => setIprPopup(null), []);

  const commitIpr = useCallback(
    (
      fromTooth: number,
      toTooth: number,
      payload: { value: string | null; note: string | null },
    ) => {
      onIprChangeRef.current?.(fromTooth, toTooth, payload);
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

  // One-type palette: a tap (or Enter / Space on the focused tooth) toggles
  // the mark at once. flushSync commits it in the click's frame, like the
  // popover's swatches.
  const toggleTooth = useCallback(
    (toothNumber: number) => {
      if (disabledRef.current || !toggleColor) return;
      flushSync(() => toggleMark(toothNumber, toggleColor.type));
    },
    [toggleColor, toggleMark],
  );

  // Decode the tooth's next image while the pointer or focus rests on it,
  // so the toggle repaints in the same frame (the popover does the same
  // for the colours it offers).
  const prefetchToggleArt = useCallback(
    (toothNumber: number) => {
      if (!toggleColor) return;
      const symbol = canonicalSpriteTooth(toothNumber);
      prefetchToothArt([
        toothArtKey(symbol, toggleColor.hex, toggleColor.outline),
        toothArtKey(symbol, DEFAULT_TOOTH, DEFAULT_OUTLINE),
      ]);
    },
    [toggleColor],
  );

  // Undefined for an empty palette: the teeth are then static labels.
  const onToothClick = toggleColor
    ? toggleTooth
    : selectable
      ? openPopup
      : undefined;
  const onToothIntent = toggleColor ? prefetchToggleArt : undefined;

  // Badge strip under the chart — recomputed only when the marks (or the
  // language) actually change, not on every popup open/close render.
  const markBadges = useMemo(
    () =>
      [...assignments.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([toothNumber, types]) =>
          types.map((type) => {
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
                <span>
                  {t('orderForm.files.tooth.toothBadge', { n: toothNumber })}
                </span>
                <span className="text-muted-foreground">
                  {markLabel ?? c?.label}
                </span>
              </Badge>
            );
          }),
        ),
    [assignments, markLabel, t],
  );

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
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            {title ??
              (mode === 'attachments'
                ? t('orderForm.files.tooth.attachmentsTitle')
                : mode === 'treatment'
                  ? t('orderForm.files.tooth.treatmentTitle')
                  : t('orderForm.files.tooth.selectorTitle'))}
            {saving && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                {t('orderForm.files.tooth.saving')}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {subtitle ??
              (mode === 'attachments'
                ? t('orderForm.files.tooth.attachmentsHint')
                : mode === 'treatment'
                  ? t('orderForm.files.tooth.treatmentHint')
                : t('orderForm.files.tooth.selectorHint'))}
          </p>
        </div>
        {!hideLegendToggle && (
          <Button
            type="button"
            variant="ghost"
            className="justify-start text-primary"
            onClick={() => setShowLegend((s) => !s)}
          >
            <Palette className="mr-2 h-4 w-4" />
            {showLegend
              ? t('orderForm.files.tooth.hideGuide')
              : t('orderForm.files.tooth.viewGuide')}
          </Button>
        )}
      </div>

      {showLegend && (
        <ColorLegend
          assignments={assignments}
          readonlyAssignments={readonlyAssignments}
          colors={visibleColors}
          markLabel={markLabel}
          showReadonly={plannerLegend}
          contactLabel={contactLegendLabel}
          contactStep={plannerLegend || !!iprNotes}
          iprValues={iprValues}
          iprNotes={iprNotes}
        />
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        {/* Skeleton while the tooth artwork downloads: same layout box
            (fixed glyph heights), a soft pulse behind each glyph slot and
            an accessible status line. Disappears the moment every tooth
            image has decoded — no layout shift either way. */}
        {!toothSpriteReady && !spriteParsedAtMount && (
          // Visible progress strip above the skeleton: the ~2 MB tooth
          // sprite is the one asset users actually wait for on a slow
          // clinic connection, so show how far along it is rather than
          // an unexplained pulse. Determinate while bytes stream in,
          // indeterminate only if the total can't be known. Held at 99
          // while the images decode, so "100 %" means "drawn".
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5 sm:px-5"
          >
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t('orderForm.files.tooth.loadingChart')}
            </span>
            <div className="min-w-0 flex-1">
              {toothSpriteProgress === null ? (
                <IndeterminateBar className="h-1.5" />
              ) : (
                <Progress
                  value={Math.min(99, toothSpriteProgress)}
                  className="h-1.5"
                />
              )}
            </div>
            {toothSpriteProgress !== null && (
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(Math.min(99, toothSpriteProgress))}%
              </span>
            )}
          </div>
        )}
        <div
          ref={chartHostRef}
          aria-busy={!toothSpriteReady || undefined}
          className={cn(
            'odo-scroll overflow-x-auto px-2 pt-8 pb-6 sm:px-5',
            !toothSpriteReady && 'odo-chart-loading',
            contactsOnly && 'odo-contacts-only',
          )}
        >
          {/* Fixed pixel width (settled container width) instead of fluid —
              the CSS min/max still clamp it. Undefined until the first
              observation (applied un-debounced right after mount); the
              value equals the fluid width, so first paint is unaffected. */}
          <div
            className="mx-auto min-w-[560px] max-w-[1180px] sm:min-w-[640px]"
            style={chartWidth !== undefined ? { width: chartWidth } : undefined}
          >
            {showUpper && (
              <Arch
                row="upper"
                left={UPPER_RIGHT}
                right={UPPER_LEFT}
                assignments={assignments}
                readonlyAssignments={readonlyAssignments}
                activeTooth={popup?.tooth ?? null}
                activeIpr={iprPopup?.tooth ?? null}
                spriteReady={toothSpriteReady}
                preferEditableFill={preferEditableFill}
                disabled={disabled}
                iprValues={iprVisible ? iprValues : undefined}
                iprNotes={iprVisible ? iprNotes : undefined}
                toggle={!!toggleColor}
                markLabel={markLabel}
                contactUnit={contactUnit}
                onToothClick={onToothClick}
                onToothIntent={onToothIntent}
                onIprClick={iprEditable ? openIprPopup : undefined}
              />
            )}
            {showUpper && showLower && (
              <div className="relative my-2 h-px bg-foreground/15">
                <span className="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/30" />
              </div>
            )}
            {showLower && (
              <Arch
                row="lower"
                left={LOWER_RIGHT}
                right={LOWER_LEFT}
                assignments={assignments}
                readonlyAssignments={readonlyAssignments}
                activeTooth={popup?.tooth ?? null}
                activeIpr={iprPopup?.tooth ?? null}
                spriteReady={toothSpriteReady}
                preferEditableFill={preferEditableFill}
                disabled={disabled}
                iprValues={iprVisible ? iprValues : undefined}
                iprNotes={iprVisible ? iprNotes : undefined}
                toggle={!!toggleColor}
                markLabel={markLabel}
                contactUnit={contactUnit}
                onToothClick={onToothClick}
                onToothIntent={onToothIntent}
                onIprClick={iprEditable ? openIprPopup : undefined}
              />
            )}
          </div>
        </div>

      </div>

      {/* Marks strip: what the chart edits. A chart with no editable colour
          (contacts only) has no marks to list. */}
      {!selectable ? null : assignments.size > 0 ? (
        <div className="flex flex-wrap gap-2">{markBadges}</div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          {t('orderForm.files.tooth.emptyState')}
        </div>
      )}

      {popup && (
        <ColorPopover
          tooth={popup.tooth}
          anchorX={popup.x}
          anchorY={popup.y}
          currentTypes={assignments.get(popup.tooth) ?? []}
          colors={visibleColors}
          extractMessage={t('orderForm.files.tooth.extractExclusive')}
          // Toggling a mark keeps the popover OPEN so several non-extraction
          // marks can be added in one go. flushSync commits in the same
          // frame as the click. Clearing / Esc / outside-click closes it.
          onToggle={(type) => flushSync(() => toggleMark(popup.tooth, type))}
          onClear={() => {
            flushSync(() => clearTooth(popup.tooth));
            closePopup();
          }}
          onClose={closePopup}
        />
      )}

      {iprPopup && iprEditable && (
        <IprPopover
          fromTooth={iprPopup.fromTooth}
          toTooth={iprPopup.tooth}
          anchorX={iprPopup.x}
          anchorY={iprPopup.y}
          unitLabel={contactUnit}
          maxMm={contactMaxMm}
          validate={validateContactAmount}
          currentValue={iprValues?.get(iprPopup.tooth)}
          currentNote={iprNotes?.get(iprPopup.tooth)}
          // Single combined commit — popover gathers both fields and
          // calls back ONCE. The parent receives (fromTooth, toTooth,
          // payload) which maps directly onto upsertIpr / removeIpr.
          onCommit={(payload) =>
            commitIpr(iprPopup.fromTooth, iprPopup.tooth, payload)
          }
          // Whether the popover should show the STEP input
          // is governed by whether `iprNotes` was wired by the parent
          // — same effective semantics as the old onCommitNote prop.
          showStripping={!!iprNotes}
          onClose={closeIprPopup}
        />
      )}
    </div>
  );
});

// ── Legend ─────────────────────────────────────────────────────────────────

/**
 * Swatches of the "between teeth" markers (the contact amount and STEP).
 * The hex values mirror the CSS so the swatch and the chip on the
 * odontogram match exactly. Kept apart from COLORS so the picker palette
 * stays focused on tooth-level marks only.
 */
const CONTACT_VALUE_HEX = '#feca16'; // brand amber — matches `.odo-ipr-value`
const CONTACT_STEP_HEX = '#7c3aed'; // violet-600 — matches `.odo-ipr-note`

/** Teeth carrying `type` in a tooth → marks map, in FDI order. */
function teethWithMark(
  map: Map<number, ToothInstructionType[]>,
  type: ToothInstructionType,
): number[] {
  const teeth: number[] = [];
  map.forEach((types, tooth) => {
    if (types.includes(type)) teeth.push(tooth);
  });
  return teeth.sort((a, b) => a - b);
}

const ColorLegend = memo(function ColorLegend({
  assignments,
  readonlyAssignments,
  colors,
  markLabel,
  showReadonly,
  contactLabel,
  contactStep,
  iprValues,
  iprNotes,
}: {
  assignments: Map<number, ToothInstructionType[]>;
  /**
   * Treatment-plan editor draws the doctor's order marks as a read-only
   * background. The legend lists those too so the planner doesn't have
   * to remember which orange tooth is "the doctor's" vs "their own".
   */
  readonlyAssignments?: Map<number, ToothInstructionType[]>;
  /**
   * Restricted palette — only iterate over the colours that are valid
   * for the current chart. Otherwise the order-page legend would list
   * the pink Attachment row even though that colour belongs to the
   * treatment-plan editor.
   */
  colors: readonly ColorEntry[];
  /** Caller's label of the editable mark (one-type palettes). */
  markLabel?: string;
  /** List the doctor's read-only marks (planner surfaces). */
  showReadonly: boolean;
  /** Label of the contact amount row; undefined hides the contact rows. */
  contactLabel?: string;
  /** Also list the STEP row under the contact amount. */
  contactStep: boolean;
  /** Optional IPR (mm) values — drives the populated-tooth counter. */
  iprValues?: Map<number, string>;
  /** Optional STEP values — same idea, separate counter. */
  iprNotes?: Map<number, string>;
}) {
  const { t } = useT();
  const teethSubtitle = (teeth: number[]) =>
    teeth.length > 0
      ? teeth.join(', ')
      : t('orderForm.files.tooth.legend.noTeeth');
  const contactsSubtitle = (count: number) => {
    if (count === 0) return t('orderForm.files.tooth.legend.contactsNone');
    return count === 1
      ? t('orderForm.files.tooth.legend.contactsOne', { count })
      : t('orderForm.files.tooth.legend.contactsMany', { count });
  };

  // Pre-compute the list of read-only doctor marks we'll actually
  // render — empty marks are skipped, so on a fresh treatment plan
  // the section title disappears entirely instead of showing a blank
  // strip of "No teeth assigned" cards.
  const readonlyRows =
    showReadonly && readonlyAssignments && readonlyAssignments.size > 0
      ? COLORS.filter((c) => c.type !== ToothInstructionType.ATTACHMENT)
          .map((c) => ({
            entry: c,
            teeth: teethWithMark(readonlyAssignments, c.type),
          }))
          .filter((row) => row.teeth.length > 0)
      : [];

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      {/* ─── Tooth-level marks ─────────────────────────────────────── */}
      {colors.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('orderForm.files.tooth.legend.toothMarks')}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {colors.map((c) => (
              <LegendRow
                key={c.type}
                hex={c.hex}
                label={markLabel ?? c.label}
                subtitle={teethSubtitle(teethWithMark(assignments, c.type))}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── Doctor's prescription (read-only on treatment view) ──── */}
      {readonlyRows.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('orderForm.files.tooth.legend.fromOrder')}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readonlyRows.map(({ entry, teeth }) => (
              <LegendRow
                key={`ro-${entry.type}`}
                hex={entry.hex}
                label={entry.label}
                subtitle={teethSubtitle(teeth)}
                badge={t('orderForm.files.tooth.legend.orderBadge')}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── Between-teeth markers: contact amount (+ step) ────────── */}
      {contactLabel !== undefined ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {contactStep
              ? t('orderForm.files.tooth.legend.betweenTeethWithStep')
              : t('orderForm.files.tooth.legend.betweenTeeth')}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <LegendRow
              hex={CONTACT_VALUE_HEX}
              label={contactLabel}
              subtitle={contactsSubtitle(iprValues?.size ?? 0)}
            />
            {contactStep ? (
              <LegendRow
                hex={CONTACT_STEP_HEX}
                label={t('orderForm.files.tooth.legend.step')}
                subtitle={contactsSubtitle(iprNotes?.size ?? 0)}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
});

/**
 * Compact legend row — matches the original order-page legend density
 * (one swatch + label + small assignment summary). Used everywhere
 * now: movement marks, doctor read-only marks, and between-teeth
 * markers (contact amount + Step). One small subtitle hint sits under the
 * label so each row carries both *what* the colour is and *where* it
 * currently shows on the chart.
 */
function LegendRow({
  hex,
  label,
  subtitle,
  badge,
}: {
  hex: string;
  label: string;
  subtitle: string;
  /** Small tag after the label ("Order" on the doctor's read-only marks). */
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 inline-block h-6 w-6 shrink-0 rounded-full border-2 border-background shadow-sm"
        style={{ background: hex }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
          {label}
          {badge ? (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
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

function Arch({
  row,
  left,
  right,
  assignments,
  readonlyAssignments,
  activeTooth,
  activeIpr,
  spriteReady,
  preferEditableFill,
  disabled,
  iprValues,
  iprNotes,
  toggle,
  markLabel,
  contactUnit,
  onToothClick,
  onToothIntent,
  onIprClick,
}: {
  row: 'upper' | 'lower';
  left: readonly number[];
  right: readonly number[];
  assignments: Map<number, ToothInstructionType[]>;
  /**
   * Doctor's order-level instructions painted as a background layer.
   * Empty Map when the caller has no readonly context to pass.
   */
  readonlyAssignments: Map<number, ToothInstructionType[]>;
  activeTooth: number | null;
  activeIpr: number | null;
  spriteReady: boolean;
  /**
   * When true, the editable layer owns the main tooth fill. Used by the
   * treatment attachment editor so selecting ATTACHMENT turns the tooth pink
   * even if the doctor's read-only colour exists underneath.
   */
  preferEditableFill?: boolean;
  disabled?: boolean;
  iprValues?: Map<number, string>;
  iprNotes?: Map<number, string>;
  /** A tooth click toggles the one editable mark (see ToothButton). */
  toggle: boolean;
  markLabel?: string;
  /** Name + unit of the contact amount, for the slots' accessible names. */
  contactUnit: string;
  /** Omitted when the chart has no editable colour: static teeth. */
  onToothClick?: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onToothIntent?: (tooth: number) => void;
  /**
   * Optional — when omitted the slots become read-only (no popup).
   * Receives BOTH the left-side and right-side tooth numbers so the
   * popup can immediately resolve the (fromTooth, toTooth) contact
   * pair that the backend's TreatmentPlanIpr table is keyed on.
   */
  onIprClick?: (
    fromTooth: number,
    toTooth: number,
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
  // STEP note — previously only checked the mm side, so a
  // STEP-only entry was invisible across the midline.
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
        // mirrors the midlineShouldRender check above so a STEP-
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
              types={assignments.get(n)}
              readonlyTypes={readonlyAssignments.get(n)}
              active={activeTooth === n}
              spriteReady={spriteReady}
              preferEditableFill={preferEditableFill}
              disabled={disabled}
              toggle={toggle}
              markLabel={markLabel}
              onClick={onToothClick}
              onIntent={onToothIntent}
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
                unitLabel={contactUnit}
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
            unitLabel={contactUnit}
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

/**
 * Build a hard-stop CSS `linear-gradient` that splits into N EQUAL bands,
 * one per colour (no blending). Used for the multi-mark number chip so it
 * mirrors the segmented tooth. One colour → returns the flat hex.
 */
function segmentGradient(hexes: string[], direction: string): string {
  const n = hexes.length;
  if (n === 0) return 'transparent';
  if (n === 1) return hexes[0];
  const stops = hexes
    .map((hex, i) => {
      const start = ((i / n) * 100).toFixed(3);
      const end = (((i + 1) / n) * 100).toFixed(3);
      return `${hex} ${start}%, ${hex} ${end}%`;
    })
    .join(', ');
  return `linear-gradient(${direction}, ${stops})`;
}

/**
 * Renders the tooth glyph coloured by its assigned instruction colours —
 * the colours are painted ON THE TOOTH, never as dots beside it.
 *
 *   • 0–1 colours → one glyph filled with that colour (or the neutral
 *     default). Identical to the original single-colour rendering.
 *   • 2, 3 or 4 colours → the SAME tooth glyph is stacked once per colour,
 *     each layer clipped to an equal horizontal band (top→bottom) and
 *     painted with one colour. Because every layer is the real tooth
 *     silhouette, the result is the tooth itself divided into equal
 *     coloured parts (e.g. half red / half green) with a crisp edge where
 *     the colours meet — no dots.
 *
 * Fully generic: the band maths derives from the colour count, so it works
 * for ANY tooth (11…48) and any of the tooth-level marks (No Attachments /
 * Do Not Move / No IPR / Extract / Attachment). The stacked layers all use
 * the same `viewBox` + `preserveAspectRatio`, so the bands stay aligned.
 *
 * Each layer draws the tooth as an image, pre-coloured (tooth-art.ts):
 * the page paints it as a single item, where the live sprite instance it
 * replaces was thousands of paint chunks.
 */
function SegmentedToothGlyph({
  viewBox,
  artKeys,
  ready,
}: {
  viewBox: string;
  /** One tooth image per colour band, top to bottom (see glyphArtKeys). */
  artKeys: readonly string[];
  /** False while the artwork downloads: an empty slot for the skeleton. */
  ready: boolean;
}) {
  if (!ready) return <GlyphFrame className="odo-glyph" viewBox={viewBox} />;
  return <ToothGlyphImages viewBox={viewBox} artKeys={artKeys} />;
}

function ToothGlyphImages({
  viewBox,
  artKeys,
}: {
  viewBox: string;
  artKeys: readonly string[];
}) {
  const urls = useToothArtUrls(artKeys);
  if (!urls) return <GlyphFrame className="odo-glyph" viewBox={viewBox} />;

  // Single (or empty) → one glyph.
  if (urls.length === 1) {
    return (
      <GlyphFrame className="odo-glyph" viewBox={viewBox} url={urls[0]} />
    );
  }

  const n = urls.length;
  return (
    <span className="odo-glyph odo-glyph-stack" aria-hidden>
      {urls.map((url, i) => {
        // Band i (0 = top): reveal only its horizontal slice via inset clip.
        const top = ((i / n) * 100).toFixed(3);
        const bottom = (((n - 1 - i) / n) * 100).toFixed(3);
        return (
          <GlyphFrame
            key={i}
            className="odo-seg-glyph"
            viewBox={viewBox}
            url={url}
            style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)` }}
          />
        );
      })}
    </span>
  );
}

/**
 * The glyph's box: the same `<svg>` the sprite instance lived in, so the
 * tooth keeps its exact geometry. The image fills the viewBox; its
 * `preserveAspectRatio="none"` (and the document's) keeps that mapping
 * exact — see tooth-art.ts.
 */
function GlyphFrame({
  className,
  viewBox,
  url,
  style,
}: {
  className: string;
  viewBox: string;
  url?: string;
  style?: CSSProperties;
}) {
  const [, , width, height] = viewBox.split(' ');
  return (
    <svg
      className={className}
      viewBox={viewBox}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
      style={style}
    >
      {url && (
        <image
          href={url}
          xlinkHref={url}
          width={width}
          height={height}
          preserveAspectRatio="none"
        />
      )}
    </svg>
  );
}

type ToothButtonProps = {
  toothNumber: number;
  row: 'upper' | 'lower';
  mirrored: boolean;
  /**
   * Editable instructions on this tooth (already normalised: EXTRACT is
   * exclusive). When more than one is present the tooth is split into
   * equal coloured bands, one per mark (see SegmentedToothGlyph). Owned
   * by the editable layer.
   */
  types?: ToothInstructionType[];
  /**
   * Doctor's read-only instructions (treatment/attachments view). Painted
   * as the fill when `preferEditableFill` is false, otherwise surfaced as
   * reference dots alongside the editable marks.
   */
  readonlyTypes?: ToothInstructionType[];
  active?: boolean;
  spriteReady: boolean;
  preferEditableFill?: boolean;
  disabled?: boolean;
  /**
   * The click toggles the one editable mark: the button is then a toggle
   * button (aria-pressed = carries the mark) instead of a popover opener.
   */
  toggle: boolean;
  /** Caller's name for the editable mark, used in the accessible name. */
  markLabel?: string;
  /**
   * Omitted when the chart has no editable colour: the tooth is then a
   * static label (disabled, no hover lift, not faded).
   */
  onClick?: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  /** Pointer or focus rests on the tooth (prefetch its next image). */
  onIntent?: (tooth: number) => void;
};

/** Order-sensitive content equality for the small (0–4 entry) mark arrays. */
function sameTypes(
  a: ToothInstructionType[] | undefined,
  b: ToothInstructionType[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ToothButton = memo(
  function ToothButton({
    toothNumber,
    row,
    mirrored,
    types,
    readonlyTypes,
    active,
    spriteReady,
    preferEditableFill,
    disabled,
    toggle,
    markLabel,
    onClick,
    onIntent,
  }: ToothButtonProps) {
    const { t } = useT();
    const marks = resolveToothMarks(types, readonlyTypes, preferEditableFill);
    // Colours painted ON the tooth: ONE colour fills the whole tooth; TWO
    // to FOUR split it into equal coloured bands (SegmentedToothGlyph).
    // No dots. `color` (first mark) still drives the single-mark number
    // chip; multi-mark chips use a matching hard-stop gradient.
    const color = marks[0];
    const isMulti = marks.length > 1;
    const chipBackground = isMulti
      ? segmentGradient(
          marks.map((m) => m.hex),
          'to right',
        )
      : color?.hex;
    const artKeys = glyphArtKeys(toothNumber, marks);
    // Normalise the host viewBox to "0 0 w h" — some source teeth (17, 27,
    // 37, 47) have content drawn far from the SVG origin (min-x ≈ 22.5).
    // The tooth image fills this box; the symbol's own viewBox lives inside
    // the image document, so its content still lands in the 0..w / 0..h box.
    const viewBox = useMemo(() => {
      const raw = TOOTH_VIEWBOXES[toothNumber];
      if (!raw) return '0 0 11 22';
      const parts = raw.split(/\s+/);
      return `0 0 ${parts[2]} ${parts[3]}`;
    }, [toothNumber]);

    const style = useMemo<CSSProperties>(
      () => ({
        transformOrigin: row === 'upper' ? 'bottom center' : 'top center',
      }),
      [row],
    );

    const handleClick = useCallback(
      (e: ReactMouseEvent<HTMLButtonElement>) => onClick?.(toothNumber, e),
      [onClick, toothNumber],
    );
    const handleIntent = useCallback(
      () => onIntent?.(toothNumber),
      [onIntent, toothNumber],
    );
    const isStatic = !onClick;
    const markNames = marks.map((c) =>
      markLabel && types?.includes(c.type) ? markLabel : c.label,
    );

    // The label chip — combines the FDI number with the optional short
    // instruction code so the number is ALWAYS visible (replacing the
    // earlier overlap-prone corner badge).
    const labelChip = (
      <span
        className={cn('odo-chip', color && 'odo-chip-on')}
        style={chipBackground ? { background: chipBackground } : undefined}
      >
        <span className="odo-chip-num">{toothNumber}</span>
        {/* Single mark → show its short code (NA / DNM / …). Multiple
            marks → show the count (×2 / ×3 / ×4); the individual codes
            live in the legend + the badge list under the chart, and the
            colours read straight off the segmented tooth. */}
        {color && !isMulti && <span className="odo-chip-sep" aria-hidden />}
        {color && !isMulti && (
          <span className="odo-chip-code">{color.short}</span>
        )}
        {isMulti && <span className="odo-chip-sep" aria-hidden />}
        {isMulti && <span className="odo-chip-code">×{marks.length}</span>}
      </span>
    );

    return (
      <button
        type="button"
        disabled={disabled || isStatic}
        onClick={isStatic ? undefined : handleClick}
        onPointerEnter={onIntent ? handleIntent : undefined}
        onFocus={onIntent ? handleIntent : undefined}
        aria-label={`${t('orderForm.files.tooth.toothBadge', { n: toothNumber })}${markNames.length ? ` — ${markNames.join(', ')}` : ''}`}
        aria-pressed={
          isStatic ? undefined : toggle ? (types?.length ?? 0) > 0 : active
        }
        data-tooth={toothNumber}
        data-active={active ? 'true' : undefined}
        className={cn(
          'odo-tooth',
          row === 'upper' ? 'odo-tooth-upper' : 'odo-tooth-lower',
          mirrored && 'odo-tooth-mirrored',
          isStatic && 'odo-tooth-static',
        )}
        style={style}
      >
        {row === 'upper' && labelChip}

        {/* The tooth itself, painted with its instruction colour(s). One
            mark fills the whole tooth; two-to-four split it into equal
            coloured bands (no dots). */}
        <SegmentedToothGlyph
          viewBox={viewBox}
          artKeys={artKeys}
          ready={spriteReady}
        />

        {row === 'lower' && labelChip}
      </button>
    );
  },
  // Compare the mark arrays by CONTENT. Every change to the instruction
  // list rebuilds the assignments Map and mints fresh per-tooth arrays —
  // with the default reference compare, marking ONE tooth re-rendered every
  // marked tooth. Content equality confines the work to the tooth that
  // changed.
  (prev, next) =>
    prev.toothNumber === next.toothNumber &&
    prev.row === next.row &&
    prev.mirrored === next.mirrored &&
    prev.active === next.active &&
    prev.spriteReady === next.spriteReady &&
    prev.preferEditableFill === next.preferEditableFill &&
    prev.disabled === next.disabled &&
    prev.toggle === next.toggle &&
    prev.markLabel === next.markLabel &&
    prev.onClick === next.onClick &&
    prev.onIntent === next.onIntent &&
    sameTypes(prev.types, next.types) &&
    sameTypes(prev.readonlyTypes, next.readonlyTypes),
);

// ── IPR slot (purple bar between two adjacent teeth) ───────────────────────

type IprSlotProps = {
  /** Anchor tooth on the right side of the contact. */
  toothNumber: number;
  /** Anchor tooth on the left side of the contact — used for labelling
   *  AND as the `fromTooth` value emitted to the parent's onIprClick. */
  neighbour?: number;
  row: 'upper' | 'lower';
  /** IPR amount in millimetres. Rendered in the yellow chip. */
  value?: string;
  /** Optional STEP / staging value. Rendered in the purple chip. */
  note?: string;
  /** Name + unit of the amount ("IPR (mm)"), for the accessible name. */
  unitLabel: string;
  active?: boolean;
  disabled?: boolean;
  /**
   * Omitted in read-only mode (doctor's view). The slot renders the
   * filled bar + mm label but doesn't open the editor popup on click.
   * Receives BOTH ends of the contact (fromTooth, toTooth) so the
   * parent can immediately call upsertIpr / removeIpr with the right
   * payload.
   */
  onClick?: (
    fromTooth: number,
    toTooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
};

const IprSlot = memo(function IprSlot({
  toothNumber,
  neighbour,
  row,
  value,
  note,
  unitLabel,
  active,
  disabled,
  onClick,
}: IprSlotProps) {
  const { t } = useT();
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      // The slot is always rendered with an explicit `neighbour` from
      // the parent Arch — but defend defensively in case a future
      // caller forgets, by skipping the emit instead of sending a
      // bogus `fromTooth=0` to the API.
      if (typeof neighbour === 'number' && onClick) {
        onClick(neighbour, toothNumber, e);
      }
    },
    [onClick, toothNumber, neighbour],
  );
  const hasValue = !!value && value.trim().length > 0;
  const hasNote = !!note && note.trim().length > 0;
  // Read-only slots (no onClick) should not be focusable as actionable
  // controls and should not appear pressable — they're a data display.
  const readOnly = !onClick;

  // "Contact 11–21" — falls back to "Tooth N" if we don't know the
  // neighbour (defensive — Arch always supplies it).
  const contact =
    typeof neighbour === 'number'
      ? contactTitle(t, neighbour, toothNumber)
      : t('orderForm.files.tooth.toothBadge', { n: toothNumber });
  const values = [
    hasValue
      ? t('orderForm.files.tooth.contact.amountValue', {
          unit: unitLabel,
          value: value ?? '',
        })
      : null,
    hasNote
      ? t('orderForm.files.tooth.contact.stepValue', { note: note ?? '' })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const label = !values
    ? t('orderForm.files.tooth.contact.add', { unit: unitLabel, contact })
    : readOnly
      ? `${values} · ${contact}`
      : t('orderForm.files.tooth.contact.edit', { values, contact });

  return (
    <button
      type="button"
      disabled={disabled || readOnly}
      onClick={readOnly ? undefined : handleClick}
      aria-label={label}
      aria-pressed={readOnly ? undefined : active}
      data-active={active ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
      className={cn(
        'odo-ipr',
        row === 'upper' ? 'odo-ipr-upper' : 'odo-ipr-lower',
        // Slot has CONTENT (either an IPR mm value OR a STEP value,
        // or both) → use the filled-purple-bar style so it's visually
        // distinct from an empty placeholder slot.
        (hasValue || hasNote) && 'odo-ipr-on',
        readOnly && 'odo-ipr-readonly',
      )}
      title={label}
    >
      <span className="odo-ipr-bar" aria-hidden />
      {/* Label rendered whenever the contact carries EITHER an IPR mm
          value OR a STEP. Visual hierarchy + colour mapping (per the
          clinical team's request):
            • IPR (mm) — YELLOW / brand amber pill (.odo-ipr-value).
              Clinical primary action — what the planner performs at
              the chair.
            • Step — PURPLE / violet pill (.odo-ipr-note). Timing
              metadata — when in the aligner protocol the IPR happens. */}
      {(hasValue || hasNote) && (
        <span className="odo-ipr-label">
          {hasValue && (
            <span className="odo-ipr-value">
              {value}
              <span className="odo-ipr-unit">mm</span>
            </span>
          )}
          {hasNote && (
            <span className="odo-ipr-note">
              <span className="odo-ipr-note-label">
                {t('orderForm.files.tooth.contact.step')}
              </span>
              {note}
            </span>
          )}
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
  currentTypes,
  colors,
  extractMessage,
  onToggle,
  onClear,
  onClose,
}: {
  tooth: number;
  anchorX: number;
  anchorY: number;
  /** Marks currently on this tooth (multi-select; EXTRACT is exclusive). */
  currentTypes: ToothInstructionType[];
  /** Subset of COLORS to show — controls movement vs. attachments-only. */
  colors: readonly ColorEntry[];
  /** Localized "extraction blocks other marks" notice. */
  extractMessage: string;
  /** Toggle a single mark on/off (parent enforces the extract rules). */
  onToggle: (type: ToothInstructionType) => void;
  /** Remove every mark from this tooth. */
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
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

  // Decode this tooth's image in every colour on offer while the user
  // reads the swatches, so a pick repaints the tooth in the same frame.
  useEffect(() => {
    const symbol = canonicalSpriteTooth(tooth);
    prefetchToothArt(colors.map((c) => toothArtKey(symbol, c.hex, c.outline)));
  }, [tooth, colors]);

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
      aria-label={t('orderForm.files.tooth.popover.pickAria', { n: tooth })}
      className="odo-popover fixed z-[1000] rounded-xl border bg-popover p-3 shadow-xl outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>
          {t('orderForm.files.tooth.popover.tooth')}{' '}
          <span className="text-foreground">{tooth}</span>
        </span>
        {currentTypes.length > 0 && (
          <span className="text-muted-foreground">
            {currentTypes.length}
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
          const active = currentTypes.includes(c.type);
          const isExtract = c.type === ToothInstructionType.EXTRACT;
          const extractActive = currentTypes.includes(
            ToothInstructionType.EXTRACT,
          );
          // While a tooth is flagged EXTRACT, the other marks are locked
          // (extraction is exclusive). The EXTRACT swatch itself stays
          // interactive so it can be toggled back off.
          const locked = extractActive && !isExtract;
          return (
            <button
              key={c.type}
              type="button"
              disabled={locked}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggle(c.type)}
              title={c.label}
              aria-label={c.label}
              aria-pressed={active}
              className={cn(
                'odo-swatch',
                active && 'odo-swatch-active',
                locked && 'cursor-not-allowed opacity-40',
              )}
              style={{ background: c.hex }}
            >
              {active && <Check className="h-4 w-4 text-white drop-shadow" />}
              <span className="odo-swatch-tip">{c.label}</span>
            </button>
          );
        })}
      </div>
      {currentTypes.includes(ToothInstructionType.EXTRACT) && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          {extractMessage}
        </p>
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        disabled={currentTypes.length === 0}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        {t('orderForm.files.tooth.clear')}
      </button>
    </div>,
    document.body,
  );
}

// ── IPR Popover ────────────────────────────────────────────────────────────

/**
 * The amount as committed: a number inside [0, maxMm] is normalised
 * ("0.20" → "0.2"); anything else is passed through untouched, so the
 * caller's own validation (and the backend's) decides what to do with it.
 */
function normaliseContactAmount(raw: string, maxMm: number): string {
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 && num <= maxMm ? num.toString() : raw;
}

function IprPopover({
  fromTooth,
  toTooth,
  anchorX,
  anchorY,
  unitLabel,
  maxMm,
  validate,
  currentValue,
  currentNote,
  onCommit,
  showStripping,
  onClose,
}: {
  /** Left-side tooth of the contact (render order). */
  fromTooth: number;
  /** Anchor / right-side tooth of the contact (render order). */
  toTooth: number;
  anchorX: number;
  anchorY: number;
  /** Name + unit of the amount field ("IPR (mm)", "Espace (mm)"). */
  unitLabel: string;
  /** Upper bound of the amount, in mm. */
  maxMm: number;
  /** Message refusing the typed amount, or null (see `validateContactAmount`). */
  validate?: (raw: string) => string | null;
  currentValue?: string;
  /** Existing STEP value. */
  currentNote?: string;
  /**
   * Single combined commit — emits BOTH the IPR mm value and the
   * optional STEP value in one callback so the parent fires one
   * persist mutation instead of two. Two separate callbacks raced
   * the backend's delete+createMany transaction and caused P2002.
   */
  onCommit: (payload: { value: string | null; note: string | null }) => void;
  /** Whether to show the second "STEP" input field. */
  showStripping?: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const fieldId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });
  const [iprDraft, setIprDraft] = useState(currentValue ?? '');
  const [stepDraft, setStepDraft] = useState(currentNote ?? '');
  const [amountError, setAmountError] = useState<string | null>(null);

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
    const trimmedIpr = iprDraft.trim();
    const trimmedStep = stepDraft.trim();
    const refusal = trimmedIpr.length > 0 ? (validate?.(trimmedIpr) ?? null) : null;
    if (refusal) {
      setAmountError(refusal);
      return;
    }
    // Build one payload that carries BOTH fields so the parent persists
    // in a single mutation. Either field can independently be null —
    // entering only an IPR amount or only a STEP is a legal state.
    onCommit({
      value:
        trimmedIpr.length > 0 ? normaliseContactAmount(trimmedIpr, maxMm) : null,
      // showStripping=false means the parent never wants the STEP
      // field at all (defensive — current call sites always opt in).
      note: showStripping
        ? trimmedStep.length > 0
          ? trimmedStep
          : null
        : null,
    });
  };

  const title = contactTitle(t, fromTooth, toTooth);
  const amountId = `${fieldId}-amount`;
  const amountErrorId = `${fieldId}-amount-error`;
  const stepId = `${fieldId}-step`;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`${unitLabel} · ${title}`}
      className="odo-popover fixed z-[1000] w-[240px] rounded-xl border bg-popover p-3 shadow-xl outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>

      {/* ─── Amount (mm) — yellow chip on the arch ──────────────────── */}
      <label
        htmlFor={amountId}
        className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {unitLabel}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={amountId}
          type="number"
          step="0.1"
          min="0"
          max={maxMm}
          inputMode="decimal"
          autoFocus
          value={iprDraft}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? amountErrorId : undefined}
          onChange={(e) => {
            setIprDraft(e.target.value);
            setAmountError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="0.2"
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">mm</span>
      </div>
      {amountError && (
        <p id={amountErrorId} role="alert" className="mt-1 text-xs text-red-600">
          {amountError}
        </p>
      )}

      {/* ─── STEP — purple chip on the arch ───────────────────────────
          Free text so clinics can use whatever encoding their protocol
          requires (`4`, `S5`, `mid`, etc.) — no numeric clamp. */}
      {showStripping && (
        <>
          <label
            htmlFor={stepId}
            className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t('orderForm.files.tooth.contact.step')}
          </label>
          <Input
            id={stepId}
            type="text"
            inputMode="text"
            value={stepDraft}
            onChange={(e) => setStepDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            placeholder={t('orderForm.files.tooth.contact.stepPlaceholder')}
            className="h-9"
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
          className="gap-1 pointer-coarse:h-11"
        >
          <Trash2 className="h-3 w-3" />
          {t('orderForm.files.tooth.clear')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          className="gap-1 pointer-coarse:h-11"
        >
          <Check className="h-3 w-3" />
          {t('orderForm.files.tooth.contact.save')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

// ── Scoped styles ──────────────────────────────────────────────────────────
// Co-located because the perf rules below (`contain`, `will-change`, GPU
// `translate3d`, a transform-only hover transition) form the perf contract
// of this component — easy to lose if they migrate to a global stylesheet.

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
  /* NOTE: we deliberately do NOT permanently promote every tooth to its
     own compositor layer here (no will-change / translateZ on the base).
     32 always-on layers made the compositor churn whenever something else
     animated over the chart — the dashboard sidebar open/close and the
     full-screen image dialog both janked. Promotion is now transient:
     applied on :hover only (below), so idle teeth cost the compositor
     nothing and the hover lift still runs on its own layer. */
  /* The hover lift animates transform only: that runs on the compositor,
     with no main-thread frame. Never transition the filter: a drop-shadow
     moves pixels, so Chrome animates it on the main thread, repainting
     and re-layerizing the page on every frame of the hover. */
  transition:
    transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
    background 180ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.odo-tooth:hover {
  /* Promote just-in-time for the lift animation, then drop back to no
     layer once the hover ends — keeps the interaction smooth without the
     idle layer cost. The shadow is set at once (see the transition note
     above): one repaint when the hover starts, one when it ends. */
  will-change: transform;
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
/* Static teeth (no editable colour, e.g. a contacts-only chart): context,
   not controls — no hover lift, no not-allowed cursor, not faded. Placed
   after the hover/disabled rules it overrides (same specificity). */
.odo-tooth-static,
.odo-tooth-static:disabled {
  cursor: default;
  opacity: 1;
}
.odo-tooth-static:hover {
  will-change: auto;
  transform: none;
  filter: none;
}

.odo-glyph {
  display: block;
  width: 100%;
  height: 96px;
  pointer-events: none;
}

/* Skeleton shown while the sprite downloads — a soft pulse in each glyph
   slot. The glyph boxes already have fixed heights, so the pulse occupies
   exactly the space the artwork will take: zero layout shift. */
.odo-chart-loading .odo-glyph {
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 7%, transparent);
  animation: odo-skeleton-pulse 1.4s ease-in-out infinite;
}
@keyframes odo-skeleton-pulse {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
.odo-tooth-mirrored .odo-glyph {
  transform: scaleX(-1);
}

/* Segmented tooth. When a tooth carries several instruction colours the
   glyph is drawn once per colour, each copy clipped to an equal
   horizontal band, so the TOOTH itself is split into equal coloured
   parts (no dots). The wrapper reuses .odo-glyph's box (width, responsive
   height, mirror transform) and hosts the absolutely-stacked bands. */
.odo-glyph-stack {
  position: relative;
}
.odo-seg-glyph {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
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
  /* Keep the number + code legible on light fills (green / orange) and
     across a multi-colour gradient chip. */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
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
  contain: layout style;
  overflow: visible;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 38px;
  /* Was 9px — bumped per the clinical team's request so the IPR + Step
     values are readable without zooming in. Sub-element font sizes
     downstream are tuned proportionally. */
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
  pointer-events: none;
  z-index: 8;
}
.odo-ipr-upper .odo-ipr-label {
  bottom: calc(100% - 12px);
}
.odo-ipr-lower .odo-ipr-label {
  top: calc(100% - 12px);
}

/* IPR and STEP are separate chips so the values do not collapse into a
   cramped pill when both are present. The mm value stays primary; STEP is
   a quieter secondary chip beneath it. */
/* ── Slot label colour vocabulary ─────────────────────────────────
   Colour assignment (set per the clinical team's request):
     • IPR (mm) — brand AMBER (#feca16). Clinical primary, the value
       the planner actually performs at the chair. Amber matches the
       Oralign brand so the mm leaps off the dark background.
     • Step — VIOLET (#7c3aed). Timing metadata — which step in the
       aligner sequence the IPR happens at. Purple/violet keeps it
       visually distinct from the amber mm.
   Two distinct colours = two distinct decisions. */
.odo-ipr-value {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-height: 18px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #feca16;                    /* brand amber — IPR mm */
  color: #191919;                         /* Midnight Ink for legibility on amber */
  box-shadow: 0 1px 4px rgba(254, 202, 22, 0.45);
  font-weight: 700;
  /* Inherits the parent .odo-ipr-label font-size (11px) — keeps the
     mm number proportional to the chip's overall scale. */
}
.odo-ipr-unit {
  font-size: 9px;
  font-weight: 800;
  opacity: 0.7;
}
.odo-ipr-note {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 17px;
  padding: 3px 6px;
  border-radius: 999px;
  background: #7c3aed;                    /* violet-600 — Step */
  color: #fff;
  box-shadow: 0 1px 3px rgba(124, 58, 237, 0.45);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.2px;
}
.odo-ipr-note-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .odo-ipr { width: 10px; min-height: 72px; }
  .odo-ipr-on .odo-ipr-bar { height: 44px; width: 5px; }
  /* Slightly smaller on phones but still significantly bigger than
     the pre-bump 8px so the value stays legible on a small screen. */
  .odo-ipr-label { font-size: 10px; min-width: max-content; }
}
@media (max-width: 480px) {
  .odo-ipr { width: 8px; min-height: 60px; }
}

/* Contacts-only chart: the teeth are static, so each slot's hit area can
   spread over them to a 44 px-wide target (the bar itself stays thin).
   Lifted above the teeth; where two targets meet, the later slot wins. */
.odo-contacts-only .odo-ipr { z-index: 1; }
.odo-contacts-only .odo-ipr::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 44px;
  transform: translateX(-50%);
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
