'use client';

import { useCallback, useEffect } from 'react';
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
    router.push(newUrl, { scroll: false });
    
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
  }, 300);

  // Sync initial state with parent
  useEffect(() => {
    onFiltersChange({
      search: currentSearch,
      role: currentRole,
      status: currentStatus,
    });
  }, [currentSearch, currentRole, currentStatus, onFiltersChange]);

  const handleSearchChange = (value: string) => {
    debouncedSearch(value);
  };

  const handleRoleChange = (value: string) => {
    updateFilters({ role: value });
  };

  const handleStatusChange = (value: string) => {
    updateFilters({ status: value });
  };

  const clearAllFilters = () => {
    updateFilters({ search: '', role: 'all', status: 'all' });
  };

  const hasActiveFilters = currentSearch || currentRole !== 'all' || currentStatus !== 'all';

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder ?? t('usersUi.filters.searchPh')}
            defaultValue={currentSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-4"
            aria-label={t('usersUi.filters.searchAria')}
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Select value={currentRole} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
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
          <SelectTrigger className="w-[140px]">
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
            className="h-9 px-2 lg:px-3"
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