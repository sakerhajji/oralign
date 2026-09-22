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
import { Check, ChevronsUpDown, PackageSearch, RotateCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocalized } from '@/lib/api/blog.service';
import { usePacks } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { ArchType, type Pack, type PackPrice } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { foldForSearch, searchGroups, type Searchable } from './pack-search';

type Translate = ReturnType<typeof useT>['t'];

/** What a pick yields: the pack and the exact active price (one arcade mode). */
export interface PackSelection {
  pack: Pack;
  price: PackPrice;
}

interface PackOption extends Searchable {
  id: string;
  pack: Pack;
  price: PackPrice;
  archLabel: string;
  priceLabel: string;
}

interface PackGroup {
  pack: Pack;
  name: string;
  facts: string[];
  options: PackOption[];
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

export function archLabel(arch: ArchType, t: Translate): string {
  return arch === ArchType.ONE_ARCH
    ? t('quoteUi.attachPack.singleArch')
    : t('quoteUi.attachPack.twoArches');
}

export function packName(pack: Pick<Pack, 'name' | 'nameI18n'>, lang: string): string {
  return pickLocalized(pack.nameI18n ?? pack.name, lang) || pack.name;
}

/** A catalogue pack, or the pack snapshot carried by a quote. */
type PackFactsSource = Pick<Pack, 'treatmentExpirationLabel' | 'finishingIncludedLabel'> & {
  isUnlimitedSteps?: boolean | null;
  maxStepsPerArch?: number | null;
  isUnlimitedCorrections?: boolean | null;
  includedCorrections?: number | null;
};

/** Short, scannable facts about a pack: aligners, refinements, validity. */
export function packFacts(pack: PackFactsSource, t: Translate, lang: string): string[] {
  const facts: string[] = [];
  if (pack.isUnlimitedSteps) {
    facts.push(t('packPicker.stepsUnlimited'));
  } else if (pack.maxStepsPerArch) {
    facts.push(t('packPicker.steps', { count: pack.maxStepsPerArch }));
  }
  const finishing = pack.finishingIncludedLabel
    ? pickLocalized(pack.finishingIncludedLabel, lang)
    : '';
  if (finishing) {
    facts.push(finishing);
  } else if (pack.isUnlimitedCorrections) {
    facts.push(t('packPicker.refinementsUnlimited'));
  } else if (pack.includedCorrections) {
    facts.push(t('packPicker.refinements', { count: pack.includedCorrections }));
  }
  const validity = pack.treatmentExpirationLabel
    ? pickLocalized(pack.treatmentExpirationLabel, lang)
    : '';
  if (validity) facts.push(t('packPicker.validity', { period: validity }));
  return facts;
}

/**
 * Active packs that have at least one active price, cheapest first, with
 * one selectable option per active arcade price.
 */
function buildPackGroups(packs: readonly Pack[], t: Translate, lang: string): PackGroup[] {
  return packs
    .filter((pack) => pack.isActive && !pack.deletedAt)
    .map((pack) => {
      const name = packName(pack, lang);
      const facts = packFacts(pack, t, lang);
      // Every translation of the name answers, whatever the UI language.
      const names = [pack.name, ...Object.values(pack.nameI18n ?? {})].filter(
        (value): value is string => typeof value === 'string' && value !== '',
      );
      const nameText = foldForSearch(names.join(' '));
      const detailText = foldForSearch(
        [
          pickLocalized(pack.descriptionI18n ?? pack.description ?? '', lang),
          ...facts,
        ].join(' '),
      );
      const prices = (pack.prices ?? [])
        .filter((price) => price.isActive)
        .sort((a, b) => ARCH_ORDER.indexOf(a.archType) - ARCH_ORDER.indexOf(b.archType));
      const options = prices.map((price): PackOption => {
        const label = archLabel(price.archType, t);
        const priceLabel = formatPrice(price.price, price.currency);
        const amount = Number(price.price);
        const primary = `${nameText} ${foldForSearch(
          `${label} ${ARCH_SEARCH_TERMS[price.archType] ?? ''} ${priceLabel}`,
        )} ${amount} ${Math.round(amount)}`;
        return {
          id: price.id,
          pack,
          price,
          archLabel: label,
          priceLabel,
          primary,
          nameWords: nameText.split(/\s+/).filter(Boolean),
          haystack: `${primary} ${detailText}`,
        };
      });
      return { pack, name, facts, options };
    })
    .filter((group) => group.options.length > 0)
    .sort(
      (a, b) =>
        Math.min(...a.options.map((o) => Number(o.price.price))) -
          Math.min(...b.options.map((o) => Number(o.price.price))) ||
        a.name.localeCompare(b.name),
    );
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
  id?: string;
}

/**
 * Searchable pack catalogue picker — used to choose the pack of a quote
 * and to add a pack line to an invoice. One option per (pack, arcade
 * price), grouped under the pack with its key facts. Search rules live in
 * `pack-search.ts`; arrows + Enter pick, Esc closes.
 */
export function PackPicker({
  value,
  onSelect,
  trigger,
  align = 'start',
  disabled,
  placeholder,
  className,
  id,
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
  const visibleGroups = useMemo(() => searchGroups(groups, query), [groups, query]);
  const visibleOptions = useMemo(
    () => visibleGroups.flatMap((g) => g.options),
    [visibleGroups],
  );
  const active = visibleOptions[Math.min(activeIndex, visibleOptions.length - 1)] ?? null;

  const selected = useMemo(
    () =>
      value
        ? (allOptions.find(
            (option) =>
              option.pack.id === value.packId && option.price.archType === value.archType,
          ) ?? null)
        : null,
    [allOptions, value],
  );

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

  const move = (delta: number) => {
    const count = visibleOptions.length;
    setActiveIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (visibleOptions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      choose(active);
    }
  };

  const optionDomId = (optionId: string) => `${listId}-option-${optionId}`;
  const selectedName = selected ? packName(selected.pack, lang) : '';

  return (
    // Modal, like a native select: inside the invoice Dialog the portalled
    // list would otherwise sit outside the dialog's scroll lock and not
    // scroll with the wheel.
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            id={id}
            type="button"
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors',
              'hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              'data-[state=open]:border-ring disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          >
            {selected ? (
              <>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{selectedName}</span>
                  <span className="text-muted-foreground"> · {selected.archLabel}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{selected.priceLabel}</span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {packsQ.isPending
                  ? t('packPicker.loading')
                  : (placeholder ?? t('packPicker.placeholder'))}
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        collisionPadding={12}
        className={cn(
          'p-0',
          trigger
            ? 'w-[min(26rem,calc(100vw_-_1.5rem))]'
            : 'w-(--radix-popover-trigger-width) min-w-[min(22rem,calc(100vw_-_1.5rem))]',
        )}
      >
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

        <div
          id={listId}
          role="listbox"
          aria-label={t('packPicker.listLabel')}
          className="max-h-[min(22rem,calc(var(--radix-popover-content-available-height)_-_5.5rem))] min-h-28 overflow-y-auto overscroll-contain p-1"
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
          ) : packsQ.isError && !packsQ.data ? (
            // Only when nothing is cached: `usePacks` refetches on every
            // mount, and a failed background refresh must not hide a list
            // that is still perfectly usable.
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
                  <RotateCw className={cn('size-3.5', packsQ.isFetching && 'animate-spin')} />
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
                <div key={group.pack.id} role="group" aria-labelledby={headingId} className="py-1">
                  <div className="px-2.5 pt-1.5 pb-1">
                    <div id={headingId} className="flex items-center gap-2 text-sm font-medium">
                      {group.name}
                      {group.pack.isForOrthodontists ? (
                        <span className="rounded border px-1 text-[10px] font-normal text-muted-foreground">
                          {t('packPicker.orthodontists')}
                        </span>
                      ) : null}
                    </div>
                    {group.facts.length > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {group.facts.join(' · ')}
                      </p>
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
                        onMouseEnter={() => setActiveIndex(visibleOptions.indexOf(option))}
                        // Keep focus in the search box: selecting by mouse
                        // must not blur the input first.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm select-none',
                          isActive && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.archLabel}</span>
                        <span className="shrink-0 tabular-nums">{option.priceLabel}</span>
                        <Check
                          className={cn(
                            'size-4 shrink-0 text-foreground',
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

function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
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
    <kbd className="rounded border bg-muted px-1 font-sans text-[10px] leading-4">{children}</kbd>
  );
}

