import { AccountSkeleton } from '@/components/account/account-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Instant fallback while an account section loads (the tabs stay in the
 * layout above it). Same frame and header size as the profile / clinic
 * pages, which then show this same AccountSkeleton while their data loads.
 * Billing settings has its own (billing-settings/loading.tsx).
 */
export default function AccountLoading() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-full max-w-sm" />
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <AccountSkeleton />
        </div>
      </div>
    </div>
  );
}
