'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';

interface SearchFiltersProps {
  onFiltersChange: (filters: {
    search: string;
    role: string;
    status: string;
  }) => void;
  placeholder?: string;
}

export function SearchFilters({ onFiltersChange, placeholder }: SearchFiltersProps) {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current values from URL
  const currentSearch = searchParams.get('search') || '';
  const currentRole = searchParams.get('role') || 'all';
  const currentStatus = searchParams.get('status') || 'all';
  const [searchDraft, setSearchDraft] = useState(currentSearch);

  const updateFilters = useCallback((updates: Partial<{ search: string; role: string; status: string }>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Update search param
    if (updates.search !== undefined) {
      if (updates.search.trim()) {
        params.set('search', updates.search.trim());
      } else {
        params.delete('search');
      }
    }
    
    // Update role param
    if (updates.role !== undefined) {
      if (updates.role && updates.role !== 'all') {
        params.set('role', updates.role);
      } else {
        params.delete('role');
      }
    }
    
    // Update status param
    if (updates.status !== undefined) {
      if (updates.status && updates.status !== 'all') {
        params.set('status', updates.status);
      } else {
        params.delete('status');
      }
    }
    
    // Reset page when filters change
    params.delete('page');
    
    // Update URL
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
    
    // Notify parent component
    const newFilters = {
      search: params.get('search') || '',
      role: params.get('role') || 'all',
      status: params.get('status') || 'all',
    };
    onFiltersChange(newFilters);
  }, [router, searchParams, onFiltersChange]);

  // Debounced search handler
  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateFilters({ search: value });
  }, 600);

  useEffect(() => {
    setSearchDraft(currentSearch);
  }, [currentSearch]);

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  // Sync initial state with parent
  useEffect(() => {
    onFiltersChange({
      search: currentSearch,
      role: currentRole,
      status: currentStatus,
    });
  }, [currentSearch, currentRole, currentStatus, onFiltersChange]);

  const handleSearchChange = (value: string) => {
    setSearchDraft(value);
    debouncedSearch(value);
  };

  const handleRoleChange = (value: string) => {
    debouncedSearch.cancel();
    updateFilters({ search: searchDraft, role: value });
  };

  const handleStatusChange = (value: string) => {
    debouncedSearch.cancel();
    updateFilters({ search: searchDraft, status: value });
  };

  const clearAllFilters = () => {
    debouncedSearch.cancel();
    setSearchDraft('');
    updateFilters({ search: '', role: 'all', status: 'all' });
  };

  const hasActiveFilters = currentSearch || currentRole !== 'all' || currentStatus !== 'all';

  return (
    <div className="grid w-full gap-3 lg:grid-cols-[minmax(300px,1fr)_auto] lg:items-center">
      <form
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          debouncedSearch.cancel();
          updateFilters({ search: searchDraft });
        }}
        role="search"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder ?? t('usersUi.filters.searchPh')}
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-11 pl-10 pr-4"
            aria-label={t('usersUi.filters.searchAria')}
          />
        </div>
      </form>
      
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Select value={currentRole} onValueChange={handleRoleChange}>
          <SelectTrigger className="h-11 w-full sm:w-[160px]" aria-label={t('usersUi.filters.rolePh')}>
            <Filter className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder={t('usersUi.filters.rolePh')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('usersUi.filters.allRoles')}</SelectItem>
            <SelectItem value="admin">{t('usersUi.roles.admin')}</SelectItem>
            <SelectItem value="dentist">{t('usersUi.roles.dentist')}</SelectItem>
            <SelectItem value="designer">{t('usersUi.roles.designer')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={currentStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-11 w-full sm:w-[160px]" aria-label={t('usersUi.filters.statusPh')}>
            <SelectValue placeholder={t('usersUi.filters.statusPh')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('usersUi.filters.allStatus')}</SelectItem>
            <SelectItem value="active">{t('usersUi.filters.active')}</SelectItem>
            <SelectItem value="blocked">{t('usersUi.filters.blocked')}</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="col-span-2 h-11 px-3 sm:col-span-1"
            aria-label={t('usersUi.filters.clearAria')}
          >
            <X className="mr-1 h-4 w-4" />
            {t('usersUi.filters.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
