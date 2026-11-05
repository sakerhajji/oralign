'use client';

import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The search box of a list screen.
 *
 * The input owns its text: only the trimmed, debounced value goes up,
 * and nothing comes back down while the user types (so no keystroke is
 * ever lost and "Dr " keeps its space). To clear it from outside, the
 * page remounts it with a new `key` instead of pushing a value in.
 * Enter commits at once, Escape clears.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  busy = false,
  className,
}: {
  /** The committed (trimmed) search, never the raw input text. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** A newer result set is loading behind the rows on screen. */
  busy?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(value);

  const commit = useDebouncedCallback((next: string) => {
    onChange(next.trim());
  }, SEARCH_DEBOUNCE_MS);

  const working = busy || draft.trim() !== value;

  const clear = () => {
    commit.cancel();
    setDraft('');
    onChange('');
  };

  return (
    <form
      role="search"
      className={cn('relative min-w-0', className)}
      onSubmit={(event) => {
        event.preventDefault();
        commit.flush();
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-9 pr-10 pl-9 text-ellipsis"
      />
      <div className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center">
        {working ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : draft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={clear}
            aria-label={t('listUi.search.clear')}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {working ? t('listUi.search.updating') : ''}
      </span>
    </form>
  );
}
