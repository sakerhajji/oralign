import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The billing settings page while it loads — the route's loading.tsx (no
 * header text yet) and the form waiting for its data (real header passed
 * in) render this same shape, so nothing jumps between the two and no
 * default value ever flashes before the saved ones.
 */
export function CompanyBillingSettingsSkeleton({ header }: { header?: ReactNode }) {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6" aria-busy="true">
      {header ?? (
        <header>
          <Skeleton className="h-7 w-56 sm:h-8" />
          <Skeleton className="mt-1 h-5 w-full max-w-md" />
        </header>
      )}

      {/* Oralign gift card */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-3 w-2/3 max-w-md" />
            </div>
          </div>
          <Skeleton className="h-5 w-40 shrink-0" />
        </CardContent>
      </Card>

      {/* Company card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Skeleton className="h-20 w-32" />
            <Skeleton className="h-8 w-36" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <FieldSkeleton key={i} />
            ))}
            <FieldSkeleton wide />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </CardContent>
      </Card>

      {/* Legal identity card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-full max-w-lg" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <FieldSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className={wide ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
