'use client';

import {
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
import { Check, Info, Palette, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToothInstruction, ToothInstructionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  {
    type: ToothInstructionType.NO_ATTACHMENTS,
    label: 'No Attachments',
    short: 'NA',
    hex: '#2563eb',
    outline: '#3b82f6',
  },
  {
    type: ToothInstructionType.DO_NOT_MOVE,
    label: 'Do Not Move',
    short: 'DNM',
    hex: '#ef4444',
    outline: '#f87171',
  },
  {
    type: ToothInstructionType.NO_IPR,
    label: 'No IPR',
    short: 'NoIPR',
    hex: '#22c55e',
    outline: '#4ade80',
  },
  {
    type: ToothInstructionType.EXTRACT,
    label: 'Extract',
    short: 'EXT',
    hex: '#7dd3fc',
    outline: '#bae6fd',
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
}: {
  value: ToothInstruction[];
  onChange: (value: ToothInstruction[]) => void;
  disabled?: boolean;
}) {
  const [showLegend, setShowLegend] = useState(true);
  const [popup, setPopup] = useState<{
    tooth: number;
    x: number;
    y: number;
    width: number;
  } | null>(null);

  // One instruction per tooth.
  const assignments = useMemo(() => {
    const map = new Map<number, ToothInstructionType>();
    for (const item of value) {
      if (!map.has(item.toothNumber)) map.set(item.toothNumber, item.type);
    }
    return map;
  }, [value]);

  // Keep onChange / value / disabled reachable from stable callbacks so
  // ToothButton's memoization actually holds across renders.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  valueRef.current = value;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

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
            Select tooth-level instructions
          </h2>
          <p className="text-sm text-muted-foreground">
            Tap any tooth to assign a color. Each tooth carries one
            instruction at a time.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="justify-start text-primary"
          onClick={() => setShowLegend((s) => !s)}
        >
          <Palette className="mr-2 h-4 w-4" />
          {showLegend ? 'Hide' : 'View'} color legend
        </Button>
      </div>

      {showLegend && <ColorLegend assignments={assignments} />}

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="odo-scroll overflow-x-auto px-2 pt-8 pb-6 sm:px-5">
          <div className="mx-auto min-w-[560px] max-w-[1180px] sm:min-w-[640px]">
            <Arch
              row="upper"
              left={UPPER_RIGHT}
              right={UPPER_LEFT}
              assignments={assignments}
              activeTooth={popup?.tooth ?? null}
              disabled={disabled}
              onToothClick={openPopup}
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
              disabled={disabled}
              onToothClick={openPopup}
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
          onPick={(type) => {
            // flushSync commits the color in the same frame as the click —
            // no popup-close animation can mask the change.
            flushSync(() => setTooth(popup.tooth, type));
            closePopup();
          }}
          onClose={closePopup}
        />
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

function ColorLegend({
  assignments,
}: {
  assignments: Map<number, ToothInstructionType>;
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLORS.map((c) => {
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

function Arch({
  row,
  left,
  right,
  assignments,
  activeTooth,
  disabled,
  onToothClick,
}: {
  row: 'upper' | 'lower';
  left: readonly number[];
  right: readonly number[];
  assignments: Map<number, ToothInstructionType>;
  activeTooth: number | null;
  disabled?: boolean;
  onToothClick: (
    tooth: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 sm:gap-x-6">
      {[left, right].map((teeth, i) => (
        <div
          key={i}
          className={cn(
            'flex justify-between gap-0.5',
            row === 'upper' ? 'items-end' : 'items-start',
          )}
        >
          {teeth.map((n) => (
            <ToothButton
              key={n}
              toothNumber={n}
              row={row}
              mirrored={MIRRORED.has(n)}
              type={assignments.get(n)}
              active={activeTooth === n}
              disabled={disabled}
              onClick={onToothClick}
            />
          ))}
        </div>
      ))}
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

// ── Popover ────────────────────────────────────────────────────────────────

function ColorPopover({
  tooth,
  anchorX,
  anchorY,
  currentType,
  onPick,
  onClose,
}: {
  tooth: number;
  anchorX: number;
  anchorY: number;
  currentType?: ToothInstructionType;
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
      <div className="grid grid-cols-4 gap-2">
        {COLORS.map((c) => {
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

/* Respect reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .odo-tooth,
  .odo-tooth:hover,
  .odo-tooth-lower:hover,
  .odo-chip,
  .odo-chip-on,
  .odo-swatch,
  .odo-swatch:hover,
  .odo-popover {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}
`;
