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
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { Check, Info, Palette, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToothInstruction, ToothInstructionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TOOTH_VIEWBOXES } from './tooth-viewboxes';
import { useT } from '@/lib/i18n/lang-context';

// ── Layout (FDI numbering) ──────────────────────────────────────────────────
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;

const MIRRORED = new Set<number>([...UPPER_LEFT, ...LOWER_RIGHT]);

/**
 * Sprite symbol each tooth renders. The sprite ships only the 16 right-side
 * symbols (11–18, 31–38): the artwork for every mirrored pair was
 * byte-identical, and the left-side teeth are ALREADY flipped with CSS
 * `scaleX(-1)` (the MIRRORED set above) — so tooth 21 rendering symbol
 * #tooth-11 produces the exact same pixels while the sprite file, its
 * parse time and the hidden symbol DOM are all halved.
 */
function canonicalSpriteTooth(toothNumber: number): number {
  if (toothNumber >= 21 && toothNumber <= 28) return toothNumber - 10; // 21→11 … 28→18
  if (toothNumber >= 41 && toothNumber <= 48) return toothNumber - 10; // 41→31 … 48→38
  return toothNumber;
}

// Sprite URL — Next.js serves /public files at the root.
const SPRITE_URL = '/teeth-sprite.svg';
const SPRITE_HOST_ID = 'oralign-tooth-sprite-host';

let toothSpritePromise: Promise<boolean> | null = null;

function normalizeSpriteMarkup(markup: string) {
  if (typeof window === 'undefined') return markup;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup;
  const svg = wrapper.querySelector('svg');

  if (svg) {
    // External <use href="/teeth-sprite.svg#tooth-11"> is fragile behind
    // some production proxy/CDN setups. Once fetched, keep the sprite in the
    // live DOM as an invisible 0x0 SVG and reference local symbols instead.
    svg.removeAttribute('style');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';
  }

  return wrapper.innerHTML;
}

function ensureToothSprite() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (document.getElementById(SPRITE_HOST_ID)) return Promise.resolve(true);
  if (toothSpritePromise) return toothSpritePromise;

  toothSpritePromise = fetch(SPRITE_URL, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load tooth sprite (${response.status})`);
      }
      const host = document.createElement('div');
      host.id = SPRITE_HOST_ID;
      host.setAttribute('aria-hidden', 'true');
      host.style.position = 'absolute';
      host.style.width = '0';
      host.style.height = '0';
      host.style.overflow = 'hidden';
      host.innerHTML = normalizeSpriteMarkup(await response.text());
      document.body.prepend(host);
      return true;
    })
    .catch(() => {
      toothSpritePromise = null;
      return false;
    });

  return toothSpritePromise;
}

function useToothSpriteReady() {
  const [ready, setReady] = useState(
    () =>
      typeof document !== 'undefined' &&
      !!document.getElementById(SPRITE_HOST_ID),
  );

  useEffect(() => {
    let cancelled = false;

    ensureToothSprite().then((isReady) => {
      if (!cancelled) setReady(isReady);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
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
] as const;

const DEFAULT_TOOTH = '#f1e8d4';
const DEFAULT_OUTLINE = '#f3eeea';
const COLOR_BY_TYPE = new Map<ToothInstructionType, ColorEntry>(
  COLORS.map((c) => [c.type, c]),
);

/**
 * The four order-level doctor instruction types among which EXTRACT is
 * exclusive. Non-extraction marks combine freely; EXTRACT stands alone.
 */
const DOCTOR_MARK_TYPES = new Set<ToothInstructionType>([
  ToothInstructionType.NO_ATTACHMENTS,
  ToothInstructionType.DO_NOT_MOVE,
  ToothInstructionType.NO_IPR,
  ToothInstructionType.EXTRACT,
]);

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
  /**
   * 'movement'   — order-wizard / order-detail context: EXTRACTION only.
   *                Only teeth flagged for extraction are colored; the other
   *                doctor instructions are not selectable on this surface.
   * 'attachments' — focused treatment attachment context: a single attachment
   *                colour, the rest of the picker is hidden.
   * 'treatment'   — full treatment-planning context: movement flags,
   *                extraction, attachments, and IPR live together.
   */
  mode?: 'movement' | 'attachments' | 'treatment';
  /** Override the default section heading. */
  title?: string;
  /** Override the default section subheading. */
  subtitle?: string;
}) {
  const { t } = useT();
  const toothSpriteReady = useToothSpriteReady();
  const [showLegend, setShowLegend] = useState(true);
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

  // Palette by context:
  // - movement: order-facing surface — the four doctor instructions
  //   (No Attachments / Do Not Move / No IPR / Extract). A tooth may carry
  //   SEVERAL of the non-extraction marks at once; EXTRACT is the only
  //   exclusive one (see `toggleMark`).
  // - attachments: focused planner surface for pink attachment marks.
  // - treatment: the full lab/planner odontogram, including attachment.
  const visibleColors = useMemo<readonly ColorEntry[]>(
    () => {
      if (mode === 'attachments') {
        return COLORS.filter((c) => c.type === ToothInstructionType.ATTACHMENT);
      }
      if (mode === 'treatment') return COLORS;
      return COLORS.filter((c) => c.type !== ToothInstructionType.ATTACHMENT);
    },
    [mode],
  );

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
                <span className="text-muted-foreground">{c?.label}</span>
              </Badge>
            );
          }),
        ),
    [assignments, t],
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
      </div>

      {showLegend && (
        <ColorLegend
          assignments={assignments}
          readonlyAssignments={readonlyAssignments}
          colors={visibleColors}
          mode={mode}
          iprValues={iprValues}
          iprNotes={iprNotes}
        />
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        {/* Skeleton while the tooth artwork downloads: same layout box
            (fixed glyph heights), a soft pulse behind each glyph slot and
            an accessible status line. Disappears the moment the sprite is
            in the DOM — no layout shift either way. */}
        {!toothSpriteReady && (
          <p role="status" className="sr-only">
            {t('orderForm.files.tooth.loadingChart')}
          </p>
        )}
        <div
          ref={chartHostRef}
          aria-busy={!toothSpriteReady || undefined}
          className={cn(
            'odo-scroll overflow-x-auto px-2 pt-8 pb-6 sm:px-5',
            !toothSpriteReady && 'odo-chart-loading',
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
            <Arch
              row="upper"
              left={UPPER_RIGHT}
              right={UPPER_LEFT}
              assignments={assignments}
              readonlyAssignments={readonlyAssignments}
              activeTooth={popup?.tooth ?? null}
              activeIpr={iprPopup?.tooth ?? null}
              spriteReady={toothSpriteReady}
              preferEditableFill={mode === 'attachments'}
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
              readonlyAssignments={readonlyAssignments}
              activeTooth={popup?.tooth ?? null}
              activeIpr={iprPopup?.tooth ?? null}
              spriteReady={toothSpriteReady}
              preferEditableFill={mode === 'attachments'}
              disabled={disabled}
              iprValues={iprVisible ? iprValues : undefined}
              iprNotes={iprVisible ? iprNotes : undefined}
              onToothClick={openPopup}
              onIprClick={iprEditable ? openIprPopup : undefined}
            />
          </div>
        </div>

      </div>

      {assignments.size > 0 ? (
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
          tooth={iprPopup.tooth}
          anchorX={iprPopup.x}
          anchorY={iprPopup.y}
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
 * Long-form clinical descriptions for each tooth-instruction color.
 * Shown in the legend so the team has the *meaning* — not just the
 * label — alongside every swatch. Keys are the enum values so the
 * lookup tolerates legacy data exactly the way the renderer does.
 */
const COLOR_DESCRIPTION: Record<ToothInstructionType, string> = {
  [ToothInstructionType.NO_ATTACHMENTS]:
    'Tooth will not carry an aligner attachment during treatment.',
  [ToothInstructionType.DO_NOT_MOVE]:
    'Tooth must stay anchored — planner will not move it.',
  [ToothInstructionType.NO_IPR]:
    'Tooth contact is excluded from interproximal reduction.',
  [ToothInstructionType.EXTRACT]:
    'Tooth flagged for extraction before or during treatment.',
  [ToothInstructionType.ATTACHMENT]:
    'Planner placed an aligner attachment on this tooth.',
  [ToothInstructionType.IPR_VALUE]:
    'Legacy per-tooth IPR marker (kept for backwards compatibility).',
};

/**
 * Extra-legend swatch — the "between teeth" markers (IPR mm and STEP).
 * Hard-coded HEX values mirror the CSS so the swatch and the chip on
 * the odontogram match exactly. Kept here instead of in COLORS so the
 * picker palette stays focused on tooth-level marks only.
 */
type BetweenTeethEntry = {
  key: 'ipr_mm' | 'step';
  label: string;
  short: string;
  hex: string;
  textHex: string;
  description: string;
};

const BETWEEN_TEETH: readonly BetweenTeethEntry[] = [
  {
    key: 'ipr_mm',
    label: 'IPR amount (mm)',
    short: 'IPR',
    hex: '#feca16',        // brand amber — matches `.odo-ipr-value`
    textHex: '#191919',
    description:
      'Interproximal reduction performed at the chair, in millimetres. The primary clinical decision between two adjacent teeth.',
  },
  {
    key: 'step',
    label: 'Step / treatment growth',
    short: 'STEP',
    hex: '#7c3aed',        // violet-600 — matches `.odo-ipr-note`
    textHex: '#ffffff',
    description:
      'Which aligner step the IPR is performed at — the treatment progression timing. Sits next to the IPR amount as a secondary chip.',
  },
] as const;

const ColorLegend = memo(function ColorLegend({
  assignments,
  readonlyAssignments,
  colors,
  mode,
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
   * for the current mode. Otherwise the order-page legend would list
   * the pink Attachment row even though that colour belongs to the
   * treatment-plan editor.
   */
  colors: readonly ColorEntry[];
  mode: 'movement' | 'attachments' | 'treatment';
  /** Optional IPR (mm) values — drives the populated-tooth counter. */
  iprValues?: Map<number, string>;
  /** Optional STEP values — same idea, separate counter. */
  iprNotes?: Map<number, string>;
}) {
  // For 'treatment' and 'attachments' mode the doctor's order marks
  // (no_attachments / do_not_move / no_ipr / extract) bleed in as
  // read-only background. Surface them in the legend too so the
  // planner can read the full picture at a glance.
  const showReadonly =
    (mode === 'treatment' || mode === 'attachments') &&
    !!readonlyAssignments &&
    readonlyAssignments.size > 0;
  const showBetweenTeeth = mode === 'treatment' || mode === 'attachments';

  // Pre-compute the list of read-only doctor marks we'll actually
  // render — empty marks are skipped, so on a fresh treatment plan
  // the section title disappears entirely instead of showing a blank
  // strip of "No teeth assigned" cards.
  const readonlyRows = showReadonly
    ? COLORS.filter((c) => c.type !== ToothInstructionType.ATTACHMENT)
        .map((c) => {
          const teeth: number[] = [];
          readonlyAssignments!.forEach((types, tooth) => {
            if (types.includes(c.type)) teeth.push(tooth);
          });
          teeth.sort((a, b) => a - b);
          return { entry: c, teeth };
        })
        .filter((row) => row.teeth.length > 0)
    : [];

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      {/* ─── Tooth-level marks ─────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tooth-level marks
        </h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {colors.map((c) => {
            const teeth: number[] = [];
            assignments.forEach((types, tooth) => {
              if (types.includes(c.type)) teeth.push(tooth);
            });
            teeth.sort((a, b) => a - b);
            return (
              <LegendRow
                key={c.type}
                hex={c.hex}
                label={c.label}
                teeth={teeth}
              />
            );
          })}
        </div>
      </section>

      {/* ─── Doctor's prescription (read-only on treatment view) ──── */}
      {readonlyRows.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            From the order (read-only)
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readonlyRows.map(({ entry, teeth }) => (
              <LegendRow
                key={`ro-${entry.type}`}
                hex={entry.hex}
                label={entry.label}
                teeth={teeth}
                readonly
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── Between-teeth markers: IPR + Step ─────────────────────── */}
      {showBetweenTeeth ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Between-teeth (IPR · step)
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {BETWEEN_TEETH.map((b) => {
              const populated =
                b.key === 'ipr_mm'
                  ? iprValues?.size ?? 0
                  : iprNotes?.size ?? 0;
              return (
                <LegendRow
                  key={b.key}
                  hex={b.hex}
                  label={b.label}
                  count={populated}
                  countLabel="contact"
                />
              );
            })}
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
 * markers (IPR amount + Step). One small subtitle hint sits under the
 * label so each row carries both *what* the colour is and *where* it
 * currently shows on the chart.
 */
function LegendRow({
  hex,
  label,
  teeth,
  count,
  countLabel,
  readonly,
}: {
  hex: string;
  label: string;
  teeth?: number[];
  count?: number;
  countLabel?: string;
  readonly?: boolean;
}) {
  let subtitle: React.ReactNode = null;
  if (teeth) {
    subtitle =
      teeth.length > 0
        ? teeth.join(', ')
        : 'No teeth assigned';
  } else if (typeof count === 'number') {
    subtitle =
      count > 0
        ? `${count} ${countLabel ?? 'item'}${count === 1 ? '' : 's'}`
        : `No ${countLabel ?? 'item'}s set`;
  }
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
          {readonly ? (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Order
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
  onToothClick,
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
  onToothClick: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
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
 */
function SegmentedToothGlyph({
  viewBox,
  spriteHref,
  colors,
}: {
  viewBox: string;
  spriteHref: string;
  /** Ordered, de-duped instruction colours for this tooth (0–4). */
  colors: ColorEntry[];
}) {
  // Single (or empty) → one glyph, exactly as before.
  if (colors.length <= 1) {
    const color = colors[0];
    return (
      <svg
        className="odo-glyph"
        viewBox={viewBox}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        focusable="false"
        style={
          {
            '--tooth-color': color?.hex ?? DEFAULT_TOOTH,
            '--tooth-outline': color?.outline ?? DEFAULT_OUTLINE,
          } as CSSProperties
        }
      >
        <use href={spriteHref} xlinkHref={spriteHref} />
      </svg>
    );
  }

  const n = colors.length;
  return (
    <span className="odo-glyph odo-glyph-stack" aria-hidden>
      {colors.map((c, i) => {
        // Band i (0 = top): reveal only its horizontal slice via inset clip.
        const top = ((i / n) * 100).toFixed(3);
        const bottom = (((n - 1 - i) / n) * 100).toFixed(3);
        return (
          <svg
            key={c.type}
            className="odo-seg-glyph"
            viewBox={viewBox}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
            focusable="false"
            style={
              {
                '--tooth-color': c.hex,
                '--tooth-outline': c.outline,
                clipPath: `inset(${top}% 0 ${bottom}% 0)`,
              } as CSSProperties
            }
          >
            <use href={spriteHref} xlinkHref={spriteHref} />
          </svg>
        );
      })}
    </span>
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
  onClick: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
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
    onClick,
  }: ToothButtonProps) {
    // Resolve the ordered list of colours to represent. `preferEditableFill`
    // decides which layer leads (and thus owns the dominant fill): the
    // treatment attachment editor wants its editable ATTACHMENT to win;
    // order surfaces want the doctor marks to lead.
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
    const marks = orderedColors.filter((c) => {
      if (seenTypes.has(c.type)) return false;
      seenTypes.add(c.type);
      return true;
    });
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
    const spriteTooth = canonicalSpriteTooth(toothNumber);
    const spriteHref = spriteReady
      ? `#tooth-${spriteTooth}`
      : `${SPRITE_URL}#tooth-${spriteTooth}`;

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
        disabled={disabled}
        onClick={handleClick}
        aria-label={`Tooth ${toothNumber}${marks.length ? ` — ${marks.map((c) => c.label).join(', ')}` : ''}`}
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

        {/* The tooth itself, painted with its instruction colour(s). One
            mark fills the whole tooth; two-to-four split it into equal
            coloured bands (no dots). */}
        <SegmentedToothGlyph
          viewBox={viewBox}
          spriteHref={spriteHref}
          colors={marks}
        />

        {row === 'lower' && labelChip}
      </button>
    );
  },
  // Compare the mark arrays by CONTENT. Every change to the instruction
  // list rebuilds the assignments Map and mints fresh per-tooth arrays —
  // with the default reference compare, marking ONE tooth repainted every
  // marked tooth (each glyph is a heavy filter-laden sprite instance).
  // Content equality confines the repaint to the tooth that changed.
  (prev, next) =>
    prev.toothNumber === next.toothNumber &&
    prev.row === next.row &&
    prev.mirrored === next.mirrored &&
    prev.active === next.active &&
    prev.spriteReady === next.spriteReady &&
    prev.preferEditableFill === next.preferEditableFill &&
    prev.disabled === next.disabled &&
    prev.onClick === next.onClick &&
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
  active,
  disabled,
  onClick,
}: IprSlotProps) {
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
      aria-label={(() => {
        const parts: string[] = [];
        if (hasValue) parts.push(`IPR ${value} mm`);
        if (hasNote) parts.push(`STEP ${note}`);
        if (parts.length === 0) return `Add IPR ${contactLabel}`;
        return readOnly
          ? `${parts.join(' · ')} ${contactLabel}`
          : `Edit ${parts.join(' · ')} — ${contactLabel}`;
      })()}
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
      title={(() => {
        if (readOnly && (hasValue || hasNote)) {
          const parts: string[] = [];
          if (hasValue) parts.push(`IPR ${value} mm`);
          if (hasNote) parts.push(`STEP ${note}`);
          return `${parts.join(' · ')} · ${contactLabel}`;
        }
        if (hasValue || hasNote) {
          const parts: string[] = [];
          if (hasValue) parts.push(`IPR ${value} mm`);
          if (hasNote) parts.push(`STEP ${note}`);
          return `Edit ${parts.join(' · ')} — ${contactLabel}`;
        }
        return `Click to add IPR ${contactLabel}`;
      })()}
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
              <span className="odo-ipr-note-label">Step</span>
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
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });
  const [iprDraft, setIprDraft] = useState(currentValue ?? '');
  const [stepDraft, setStepDraft] = useState(currentNote ?? '');

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
    // Build one payload that carries BOTH fields so the parent persists
    // in a single mutation. Either field can independently be null —
    // entering only an IPR amount or only a STEP is a legal state.
    const clampMm = (raw: string): string => {
      const num = Number(raw);
      return Number.isFinite(num) && num >= 0 && num <= 2 ? num.toString() : raw;
    };

    onCommit({
      value: trimmedIpr.length > 0 ? clampMm(trimmedIpr) : null,
      // showStripping=false means the parent never wants the STEP
      // field at all (defensive — current call sites always opt in).
      note: showStripping
        ? trimmedStep.length > 0
          ? trimmedStep
          : null
        : null,
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

      {/* ─── IPR (mm) — yellow chip on the arch ─────────────────────── */}
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        IPR (mm)
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          min="0"
          max="2"
          inputMode="decimal"
          autoFocus
          value={iprDraft}
          onChange={(e) => setIprDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="0.2"
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">mm</span>
      </div>

      {/* ─── STEP — purple chip on the arch ───────────────────────────
          Free text so clinics can use whatever encoding their protocol
          requires (`4`, `S5`, `mid`, etc.) — no numeric clamp. */}
      {showStripping && (
        <>
          <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            STEP
          </label>
          <Input
            type="text"
            inputMode="text"
            value={stepDraft}
            onChange={(e) => setStepDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="e.g. 10"
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
  /* NOTE: we deliberately do NOT permanently promote every tooth to its
     own compositor layer here (no will-change / translateZ on the base).
     32 always-on layers made the compositor churn whenever something else
     animated over the chart — the dashboard sidebar open/close and the
     full-screen image dialog both janked. Promotion is now transient:
     applied on :hover only (below), so idle teeth cost the compositor
     nothing and the hover lift still runs on its own layer. */
  transition:
    transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 180ms cubic-bezier(0.4, 0, 0.2, 1),
    background 180ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.odo-tooth:hover {
  /* Promote just-in-time for the lift animation, then drop back to no
     layer once the hover ends — keeps the interaction smooth without the
     idle layer cost. */
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
