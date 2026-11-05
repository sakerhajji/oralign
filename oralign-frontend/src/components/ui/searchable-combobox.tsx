'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
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
  items: readonly ComboboxItem[];
  /**
   * What the trigger shows for `value` while `items` does not contain it —
   * a lazily loaded list (country/city picker) has no items until it opens.
   */
  selectedItem?: ComboboxItem | null;
  /** Called with `true` when the panel opens and `false` when it closes. */
  onOpenChange?: (open: boolean) => void;
  /** The list is being fetched: a loading row replaces the items. */
  loading?: boolean;
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

/** The panel renders at most this many rows; search narrows the rest. */
const MAX_ROWS = 200;

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
  selectedItem,
  onOpenChange,
  loading = false,
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
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });

  // Every open/close goes through here so the parent hears about it (the
  // country/city picker loads its dataset on the first open).
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    setQuery('');
    setActiveIndex(0);
    onOpenChangeRef.current?.(next);
  }, []);

  const selected = useMemo(
    () =>
      items.find((it) => it.value === value) ??
      (value != null && selectedItem?.value === value ? selectedItem : null),
    [items, value, selectedItem],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, MAX_ROWS); // cap initial list so first paint is fast
    return items
      .filter((it) => {
        const hay = (it.keywords ?? `${it.label} ${it.hint ?? ''}`).toLowerCase();
        return hay.includes(q);
      })
      .slice(0, MAX_ROWS);
  }, [items, query]);

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
        changeOpen(false);
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
      changeOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, changeOpen]);

  // Focus the search input shortly after opening so the keyboard can drive it.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const pick = useCallback(
    (item: ComboboxItem) => {
      onChange(item.value);
      changeOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, changeOpen],
  );

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
      changeOpen(false);
    }
  };

  const showRows = !loading && filtered.length > 0;
  const activeOptionId = showRows ? `${listboxId}-${activeIndex}` : undefined;

  return (
    <>
      <button
        id={id ?? triggerId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => changeOpen(!open)}
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
              aria-label={t('uiBits.clearSelection')}
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
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKey}
                  placeholder={t('uiBits.search')}
                  aria-controls={listboxId}
                  aria-activedescendant={activeOptionId}
                  className="h-8 bg-background pl-7 text-sm"
                />
              </div>
              {hint && !loading && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>

            <div
              id={listboxId}
              role="listbox"
              aria-busy={loading || undefined}
              // `relative`: the rows' offsetTop is measured from this list.
              className="relative max-h-64 overflow-auto py-1"
            >
              {loading ? (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('settingsDesk.picker.loading')}
                </p>
              ) : !showRows ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {effectiveEmptyLabel}
                </p>
              ) : (
                filtered.map((it, idx) => (
                  <ComboboxRow
                    key={it.value}
                    id={`${listboxId}-${idx}`}
                    index={idx}
                    item={it}
                    active={idx === activeIndex}
                    selected={it.value === value}
                    onHover={setActiveIndex}
                    onPick={pick}
                  />
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * One option. Memoised with stable callbacks so moving the pointer across
 * the list re-renders the two rows whose `active` flag flips, not all 200.
 */
const ComboboxRow = memo(function ComboboxRow({
  id,
  index,
  item,
  active,
  selected,
  onHover,
  onPick,
}: {
  id: string;
  index: number;
  item: ComboboxItem;
  active: boolean;
  selected: boolean;
  onHover: (index: number) => void;
  onPick: (item: ComboboxItem) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the keyboard-highlighted row visible inside the scrolling list (a
  // no-op for a row the pointer is already over). Scrolls the list only —
  // scrollIntoView would also scroll the page under the fixed panel.
  useEffect(() => {
    const row = ref.current;
    const list = row?.parentElement;
    if (!active || !row || !list) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [active]);

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseEnter={() => onHover(index)}
      onClick={() => onPick(item)}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
        active && 'bg-muted',
        selected && 'font-medium',
      )}
    >
      {item.prefix && (
        <span className="text-base leading-none" aria-hidden>
          {item.prefix}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.hint && (
        <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
      )}
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
});
