'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

export interface ComboboxItem {
  value: string;
  label: string;
  /** Optional secondary label rendered to the right (e.g. dial code, region). */
  hint?: string;
  /** Optional emoji / icon rendered before the label (e.g. flag). */
  prefix?: string;
  /** Searchable haystack — defaults to label + hint. */
  keywords?: string;
}

export interface SearchableComboboxProps {
  id?: string;
  value?: string | null;
  onChange: (next: string | null) => void;
  items: ComboboxItem[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  isInvalid?: boolean;
  className?: string;
  /** Rendered above the list — useful for a small banner ("Pick country first"). */
  hint?: string;
  /** Allow clearing the value with an X button. */
  clearable?: boolean;
}

/**
 * Headless combobox with built-in search filtering.
 *
 * - Click trigger → portal-rendered panel anchored to the trigger.
 * - Esc / outside click / scroll closes the panel.
 * - Up/Down/Enter/Tab navigates the filtered list.
 * - Items are virtually filtered (case-insensitive substring on label + hint).
 *
 * No Radix dep — keeps the bundle small. Behaves like cmdk for the bits the
 * country/city picker needs without bringing another library in.
 */
export function SearchableCombobox({
  id,
  value,
  onChange,
  items,
  placeholder,
  emptyLabel,
  disabled,
  isInvalid,
  className,
  hint,
  clearable = true,
}: SearchableComboboxProps) {
  const { t } = useT();
  // Language-aware defaults — resolved here (not as parameter defaults)
  // because hooks can't run in the destructuring position.
  const effectivePlaceholder = placeholder ?? t('uiBits.select');
  const effectiveEmptyLabel = emptyLabel ?? t('uiBits.noMatches');
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });

  const selected = useMemo(
    () => items.find((it) => it.value === value) ?? null,
    [items, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 200); // cap initial list so first paint is fast
    return items.filter((it) => {
      const hay =
        (it.keywords ?? `${it.label} ${it.hint ?? ''}`).toLowerCase();
      return hay.includes(q);
    }).slice(0, 200);
  }, [items, query]);

  // Reset active highlight when filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Anchor the panel to the trigger on open + on resize/scroll.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePosition]);

  // Esc + outside-click close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Focus the search input shortly after opening so the keyboard can drive it.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const pick = (item: ComboboxItem) => {
    onChange(item.value);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const choice = filtered[activeIndex];
      if (choice) pick(choice);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        id={id ?? triggerId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm transition-colors',
          'hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          isInvalid && 'border-destructive focus-visible:ring-destructive/30',
          disabled && 'cursor-not-allowed opacity-50',
          !selected && 'text-muted-foreground',
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
          {selected?.prefix && (
            <span className="text-base leading-none" aria-hidden>
              {selected.prefix}
            </span>
          )}
          <span className="truncate">
            {selected ? selected.label : effectivePlaceholder}
          </span>
          {selected?.hint && (
            <span className="ml-1 truncate text-xs text-muted-foreground">
              {selected.hint}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              left: pos.left,
              top: pos.top,
              width: Math.max(pos.width, 240),
              maxWidth: 'calc(100vw - 16px)',
            }}
            className="fixed z-[1000] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl animate-in fade-in zoom-in-95"
          >
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={t('uiBits.search')}
                  className="h-8 bg-background pl-7 text-sm"
                />
              </div>
              {hint && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>

            <div className="max-h-64 overflow-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {effectiveEmptyLabel}
                </p>
              ) : (
                filtered.map((it, idx) => {
                  const active = idx === activeIndex;
                  const isSelected = it.value === value;
                  return (
                    <button
                      key={it.value}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => pick(it)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        active && 'bg-muted',
                        isSelected && 'font-medium',
                      )}
                    >
                      {it.prefix && (
                        <span className="text-base leading-none" aria-hidden>
                          {it.prefix}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {it.label}
                      </span>
                      {it.hint && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {it.hint}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
