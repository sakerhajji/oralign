'use client';

import { FilterSelect } from '@/components/shared/filter-select';
import { ListSearch } from '@/components/shared/list-search';
import { useT } from '@/lib/i18n/lang-context';
import { UserRole, VerificationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ActivityFilter } from '@/lib/account-activity/account-activity';
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
  /**
   * Doctor inactivity filter (dentists only: active / warned / inactive).
   * Rendered only when the page passes both props; its state lives in the
   * page, next to the other filters (`?activity=` in the address bar).
   */
  activity?: ActivityFilter;
  onActivityChange?: (activity: ActivityFilter) => void;
}

/**
 * Search box + the list filters (four, five with the activity one). To
 * clear the search on its own the page remounts this component with a
 * new `key` (see ListSearch).
 */
export function SearchFilters({
  filters,
  onChange,
  placeholder,
  busy = false,
  activity,
  onActivityChange,
}: SearchFiltersProps) {
  const { t } = useT();
  const withActivity = activity !== undefined && onActivityChange !== undefined;

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

      <div
        className={cn(
          'grid grid-cols-2 gap-2 xl:flex xl:shrink-0',
          withActivity ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-4',
        )}
      >
        <FilterSelect<RoleFilter>
          label={t('usersDesk.filters.role')}
          value={filters.role}
          onValueChange={(role) => onChange({ role })}
          options={[
            { value: 'all', label: t('usersDesk.filters.roleAll') },
            { value: UserRole.DENTIST, label: t('usersUi.roles.dentist') },
            { value: UserRole.TECHNICIAN, label: t('usersUi.roles.technician') },
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
        {withActivity && (
          <FilterSelect<ActivityFilter>
            label={t('accountActivity.filter.label')}
            value={activity}
            onValueChange={onActivityChange}
            className="xl:w-40"
            options={[
              { value: 'all', label: t('accountActivity.filter.all') },
              { value: 'active', label: t('accountActivity.filter.active') },
              { value: 'warned', label: t('accountActivity.filter.warned') },
              { value: 'inactive', label: t('accountActivity.filter.inactive') },
            ]}
          />
        )}
      </div>
    </div>
  );
}
