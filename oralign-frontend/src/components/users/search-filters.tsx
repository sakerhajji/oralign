'use client';

import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/lib/i18n/lang-context';
import { UserRole, VerificationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import type {
  ApprovalFilter,
  GiftFilter,
  RoleFilter,
  StatusFilter,
  UsersFilters,
} from './users-filters';

const SEARCH_DEBOUNCE_MS = 300;

interface SearchFiltersProps {
  filters: UsersFilters;
  onChange: (patch: Partial<UsersFilters>) => void;
  placeholder: string;
  /** A newer result set is loading behind the rows on screen. */
  busy?: boolean;
}

/**
 * Search box + the four list filters.
 *
 * The input owns its text: only the trimmed, debounced value goes up to
 * the page, and nothing comes back down while the admin types (so no
 * keystroke is ever lost and "Dr " keeps its space). When the page
 * clears the search on its own it remounts this component with a new
 * `key` instead of pushing a value in.
 */
export function SearchFilters({
  filters,
  onChange,
  placeholder,
  busy = false,
}: SearchFiltersProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(filters.search);

  const commitSearch = useDebouncedCallback((value: string) => {
    onChange({ search: value.trim() });
  }, SEARCH_DEBOUNCE_MS);

  const searchPending = draft.trim() !== filters.search;
  const working = busy || searchPending;

  const clearSearch = () => {
    commitSearch.cancel();
    setDraft('');
    onChange({ search: '' });
  };

  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
      <form
        role="search"
        className="relative min-w-0 xl:flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          commitSearch.flush();
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
            commitSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && draft) {
              event.preventDefault();
              clearSearch();
            }
          }}
          placeholder={placeholder}
          aria-label={t('usersDesk.filters.searchAria')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-9 pr-10 pl-9"
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
              onClick={clearSearch}
              aria-label={t('usersDesk.filters.clearSearch')}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {working ? t('usersDesk.filters.updating') : ''}
        </span>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:flex xl:shrink-0">
        <FilterSelect<RoleFilter>
          label={t('usersDesk.filters.role')}
          value={filters.role}
          onValueChange={(role) => onChange({ role })}
          options={[
            { value: 'all', label: t('usersDesk.filters.roleAll') },
            { value: UserRole.DENTIST, label: t('usersUi.roles.dentist') },
            { value: UserRole.ADMIN, label: t('usersUi.roles.admin') },
            { value: UserRole.DESIGNER, label: t('usersUi.roles.designer') },
            { value: UserRole.SUPER_ADMIN, label: t('usersUi.roles.super_admin') },
          ]}
        />
        <FilterSelect<StatusFilter>
          label={t('usersDesk.filters.status')}
          value={filters.status}
          onValueChange={(status) => onChange({ status })}
          options={[
            { value: 'all', label: t('usersDesk.filters.statusAll') },
            { value: 'active', label: t('usersDesk.filters.statusActive') },
            { value: 'blocked', label: t('usersDesk.filters.statusBlocked') },
          ]}
        />
        <FilterSelect<ApprovalFilter>
          label={t('usersDesk.filters.approval')}
          value={filters.approval}
          onValueChange={(approval) => onChange({ approval })}
          options={[
            { value: 'all', label: t('usersDesk.filters.approvalAll') },
            {
              value: VerificationStatus.PENDING,
              label: t('usersDesk.filters.approvalPending'),
            },
            {
              value: VerificationStatus.APPROVED,
              label: t('usersDesk.filters.approvalApproved'),
            },
            {
              value: VerificationStatus.REJECTED,
              label: t('usersDesk.filters.approvalRejected'),
            },
          ]}
        />
        <FilterSelect<GiftFilter>
          label={t('usersDesk.filters.gift')}
          value={filters.gift}
          onValueChange={(gift) => onChange({ gift })}
          options={[
            { value: 'all', label: t('usersDesk.filters.giftAll') },
            { value: 'available', label: t('usersDesk.filters.giftAvailable') },
            { value: 'used', label: t('usersDesk.filters.giftUsed') },
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect<V extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string }[];
}) {
  // Unfiltered, the trigger names the dimension ("Rôle"); filtered, it
  // shows the chosen value, highlighted.
  const active = value !== 'all';
  const shown = active
    ? options.find((option) => option.value === value)?.label
    : label;
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as V)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'w-full min-w-0 data-[size=default]:h-9 xl:w-44',
          active
            ? 'border-foreground/25 bg-muted/50 font-medium'
            : 'text-muted-foreground',
        )}
      >
        <SelectValue>{shown}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
