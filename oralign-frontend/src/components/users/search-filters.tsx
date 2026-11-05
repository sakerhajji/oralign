'use client';

import { FilterSelect } from '@/components/shared/filter-select';
import { ListSearch } from '@/components/shared/list-search';
import { useT } from '@/lib/i18n/lang-context';
import { UserRole, VerificationStatus } from '@/lib/types';
import type {
  ApprovalFilter,
  GiftFilter,
  RoleFilter,
  StatusFilter,
  UsersFilters,
} from './users-filters';

interface SearchFiltersProps {
  filters: UsersFilters;
  onChange: (patch: Partial<UsersFilters>) => void;
  placeholder: string;
  /** A newer result set is loading behind the rows on screen. */
  busy?: boolean;
}

/**
 * Search box + the four list filters. To clear the search on its own
 * the page remounts this component with a new `key` (see ListSearch).
 */
export function SearchFilters({
  filters,
  onChange,
  placeholder,
  busy = false,
}: SearchFiltersProps) {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
      <ListSearch
        value={filters.search}
        onChange={(search) => onChange({ search })}
        placeholder={placeholder}
        ariaLabel={t('usersDesk.filters.searchAria')}
        busy={busy}
        className="xl:flex-1"
      />

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
