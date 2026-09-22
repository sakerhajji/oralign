'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  ChevronsUpDown,
  Package,
  PackageSearch,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocalized } from '@/lib/api/blog.service';
import { usePacks } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { ArchType, type Pack, type PackPrice } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';

type Translate = ReturnType<typeof useT>['t'];

/** What a pick yields: the pack and the exact active price (one arcade mode). */
export interface PackSelection {
  pack: Pack;
  price: PackPrice;
}

interface PackOption {
  id: string;
  pack: Pack;
  price: PackPrice;
  archLabel: string;
  priceLabel: string;
  /** Accent-folded text the search runs against. */
  haystack: string;
}

interface PackGroup {
  pack: Pack;
  name: string;
  features: string[];
  options: PackOption[];
  minPrice: number;
}

/** Lower-case with accents folded, so "leger" finds "Léger". */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Extra words an arcade option answers to, in both dashboard languages,
 * whatever the UI language — people type "une arcade" or "single" alike.
 */
const ARCH_SEARCH_TERMS: Record<ArchType, string> = {
  [ArchType.TWO_ARCHES]: 'deux arcades 2 arcades double two arches both',
  [ArchType.ONE_ARCH]: 'arcade unique une arcade 1 arcade single arch one arch',
};

/** Two arches first, like the price grid. */
const ARCH_ORDER: readonly ArchType[] = [ArchType.TWO_ARCHES, ArchType.ONE_ARCH];

/** Short, scannable facts about a pack: stages, refinements, validity. */
export function packFeatures(pack: Pack, t: Translate, lang: string): string[] {
  const features: string[] = [];
  if (pack.isUnlimitedSteps) {
    features.push(t('packPicker.stepsUnlimited'));
  } else if (pack.maxStepsPerArch) {
    features.push(t('packPicker.steps', { count: pack.maxStepsPerArch }));
  }
  const finishing = pack.finishingIncludedLabel
    ? pickLocalized(pack.finishingIncludedLabel, lang)
    : '';
  if (finishing) {
    features.push(finishing);
  } else if (pack.isUnlimitedCorrections) {
    features.push(t('packPicker.refinementsUnlimited'));
  } else if (pack.includedCorrections) {
    features.push(t('packPicker.refinements', { count: pack.includedCorrections }));
  }
  const validity = pack.treatmentExpirationLabel
    ? pickLocalized(pack.treatmentExpirationLabel, lang)
    : '';
  if (validity) features.push(t('packPicker.validity', { period: validity }));
  return features;
}

/**
 * Active packs that have at least one active price, cheapest first, with
 * one selectable option per active arcade price.
 */
function buildPackGroups(
  packs: readonly Pack[],
  t: Translate,
  lang: string,
): PackGroup[] {
  return packs
    .filter((pack) => pack.isActive && !pack.deletedAt)
    .map((pack) => {
      const name = pickLocalized(pack.nameI18n ?? pack.name, lang) || pack.name;
      const description =
        pickLocalized(pack.descriptionI18n ?? pack.description ?? '', lang) || '';
      const features = packFeatures(pack, t, lang);
      const prices = (pack.prices ?? [])
        .filter((price) => price.isActive)
        .sort(
          (a, b) => ARCH_ORDER.indexOf(a.archType) - ARCH_ORDER.indexOf(b.archType),
        );
      const groupText = [name, pack.name, description, ...features].join(' ');
      const options = prices.map((price): PackOption => {
        const archLabel =
          price.archType === ArchType.ONE_ARCH
            ? t('quoteUi.attachPack.singleArch')
            : t('quoteUi.attachPack.twoArches');
        const priceLabel = formatPrice(price.price, price.currency);
        const amount = Number(price.price);
        return {
          id: price.id,
          pack,
          price,
          archLabel,
          priceLabel,
          haystack: foldForSearch(
            `${groupText} ${archLabel} ${ARCH_SEARCH_TERMS[price.archType] ?? ''} ${priceLabel} ${amount} ${Math.round(amount)}`,
          ),
        };
      });
      return {
        pack,
        name,
        features,
        options,
        minPrice: Math.min(...prices.map((price) => Number(price.price))),
      };
    })
    .filter((group) => group.options.length > 0)
    .sort((a, b) => a.minPrice - b.minPrice || a.name.localeCompare(b.name));
}

interface PackPickerProps {
  /** Current pack + arcade; the default trigger displays it. */
  value?: { packId: string; archType: ArchType } | null;
  onSelect: (selection: PackSelection) => void;
  /**
   * Replaces the default field-style trigger — e.g. an "Add a pack"
   * button. Must be a single focusable element (rendered `asChild`).
   */
  trigger?: ReactNode;
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable pack catalogue picker — used to attach a pack to a quote and
 * to add a pack line to an invoice. One option per (pack, arcade price),
 * grouped under the pack with its key facts; accent-insensitive search on
 * name, description, arcade and price; full keyboard control (arrows +
 * Enter, Esc closes).
 */
export function PackPicker({
  value,
  onSelect,
  trigger,
  align = 'start',
  disabled,
  placeholder,
  className,
}: PackPickerProps) {
  const { t, lang } = useT();
  const packsQ = usePacks({ limit: 100 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const optionNodes = useRef(new Map<string, HTMLDivElement>());

  const groups = useMemo(
    () => buildPackGroups(packsQ.data?.data ?? [], t, lang),
    [packsQ.data, t, lang],
  );
  const allOptions = useMemo(() => groups.flatMap((g) => g.options), [groups]);

  const visibleGroups = useMemo(() => {
    const tokens = foldForSearch(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return groups;
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          tokens.every((token) => option.haystack.includes(token)),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);
  const visibleOptions = useMemo(
    () => visibleGroups.flatMap((g) => g.options),
    [visibleGroups],
  );
  const active =
    visibleOptions[Math.min(activeIndex, visibleOptions.length - 1)] ?? null;

  const selected = useMemo(
    () =>
      value
        ? allOptions.find(
            (option) =>
              option.pack.id === value.packId &&
              option.price.archType === value.archType,
          ) ?? null
        : null,
    [allOptions, value],
  );
  const selectedName = selected
    ? groups.find((g) => g.pack.id === selected.pack.id)?.name
    : undefined;

  // Keep the keyboard cursor in view as it moves through a long list.
  useEffect(() => {
    if (open && active) {
      optionNodes.current.get(active.id)?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, active]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Every opening starts from a clean search, cursor on the current pick.
      setQuery('');
      setActiveIndex(
        Math.max(selected ? allOptions.findIndex((o) => o.id === selected.id) : 0, 0),
      );
    }
    setOpen(next);
  };

  const choose = (option: PackOption) => {
    onSelect({ pack: option.pack, price: option.price });
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (visibleOptions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (Math.min(i, visibleOptions.length - 1) + 1) % visibleOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        (i) =>
          (Math.min(i, visibleOptions.length - 1) - 1 + visibleOptions.length) %
          visibleOptions.length,
      );
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      choose(active);
    }
  };

  const optionDomId = (id: string) => `${listId}-option-${id}`;

  return (
    // Modal, like a native select: inside the invoice Dialog the portalled
    // list would otherwise sit outside the dialog's scroll lock and not
    // scroll with the wheel.
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'flex h-12 w-full items-center gap-3 rounded-lg border bg-background px-3 text-left transition-colors',
              'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'data-[state=open]:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Package className="size-4" />
            </span>
            {selected ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {selectedName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {selected.archLabel}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {selected.priceLabel}
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {packsQ.isPending
                  ? t('packPicker.loading')
                  : placeholder ?? t('packPicker.placeholder')}
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn(
          'p-0',
          trigger
            ? 'w-[min(26rem,calc(100vw_-_1rem))]'
            : 'w-(--radix-popover-trigger-width) min-w-[min(22rem,calc(100vw_-_1rem))]',
        )}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionDomId(active.id) : undefined}
            aria-label={t('packPicker.searchPlaceholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('packPicker.searchPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              aria-label={t('packPicker.clearSearch')}
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Options */}
        <div
          id={listId}
          role="listbox"
          aria-label={t('packPicker.listLabel')}
          className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)_-_6rem))] overflow-y-auto overscroll-contain p-1"
        >
          {packsQ.isPending ? (
            <div className="space-y-3 p-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : packsQ.isError ? (
            <EmptyState
              title={t('packPicker.loadError')}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => packsQ.refetch()}
                  disabled={packsQ.isFetching}
                >
                  <RotateCw
                    className={cn('size-3.5', packsQ.isFetching && 'animate-spin')}
                  />
                  {t('packPicker.retry')}
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              title={t('packPicker.emptyCatalogue')}
              hint={t('packPicker.emptyCatalogueHint')}
            />
          ) : visibleOptions.length === 0 ? (
            <EmptyState
              title={t('packPicker.noMatch', { query: query.trim() })}
              hint={t('packPicker.noMatchHint')}
            />
          ) : (
            visibleGroups.map((group) => {
              const headingId = `${listId}-group-${group.pack.id}`;
              return (
                <div
                  key={group.pack.id}
                  role="group"
                  aria-labelledby={headingId}
                  className="py-1"
                >
                  <div className="px-2.5 pb-1 pt-1.5">
                    <div
                      id={headingId}
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      {group.name}
                      {group.pack.isForOrthodontists ? (
                        <span className="rounded-full border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                          {t('packPicker.orthodontists')}
                        </span>
                      ) : null}
                    </div>
                    {group.features.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {group.features.map((feature) => (
                          <span
                            key={feature}
                            className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {group.options.map((option) => {
                    const isActive = active?.id === option.id;
                    const isSelected = selected?.id === option.id;
                    return (
                      <div
                        key={option.id}
                        id={optionDomId(option.id)}
                        ref={(node) => {
                          if (node) optionNodes.current.set(option.id, node);
                          else optionNodes.current.delete(option.id);
                        }}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() =>
                          setActiveIndex(visibleOptions.indexOf(option))
                        }
                        // Keep focus in the search box: selecting by mouse
                        // must not blur the input first.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                        className={cn(
                          'flex cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-sm',
                          isActive && 'bg-accent text-accent-foreground',
                          isSelected && 'font-medium',
                        )}
                      >
                        <ArchGlyph arch={option.price.archType} />
                        <span className="min-w-0 flex-1 truncate">{option.archLabel}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {option.priceLabel}
                        </span>
                        <Check
                          className={cn(
                            'size-4 shrink-0 text-primary',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden="true"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span aria-live="polite">
            {t('packPicker.resultCount', { count: visibleOptions.length })}
          </span>
          <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('packPicker.navigate')}
            <Kbd>↵</Kbd>
            {t('packPicker.choose')}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <PackageSearch className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 font-sans text-[10px] leading-4">
      {children}
    </kbd>
  );
}

/** Tiny arcade diagram: upper + lower arc for two arches, one arc for one. */
function ArchGlyph({ arch }: { arch: ArchType }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4 shrink-0 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 8.5a6 5 0 0 1 12 0" />
      {arch === ArchType.TWO_ARCHES ? <path d="M4 11.5a6 5 0 0 0 12 0" /> : null}
    </svg>
  );
}
