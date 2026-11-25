'use client';

import { RefreshCw } from 'lucide-react';
import { DossierView } from '@/components/production/dossier-view';
import { isProductionRole, productionErrorText } from '@/components/production/production-format';
import {
  BackLink,
  ProductionFrame,
  ProductionMessage,
  ProductionNoAccess,
} from '@/components/production/production-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readProductionError } from '@/lib/api/production.service';
import { useProductionDossier } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';

export function DossierContent({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  if (!user) {
    return (
      <ProductionFrame>
        <DossierSkeleton />
      </ProductionFrame>
    );
  }
  if (!isProductionRole(user.role)) return <ProductionNoAccess />;
  return <Dossier orderId={orderId} />;
}

function Dossier({ orderId }: { orderId: string }) {
  const { t } = useT();
  const dossier = useProductionDossier(orderId);
  const caseHref = `/dashboard/production/${encodeURIComponent(orderId)}`;

  return (
    <ProductionFrame>
      <BackLink href={caseHref}>{t('production.nav.backToCase')}</BackLink>
      {dossier.isPending ? (
        <DossierSkeleton />
      ) : dossier.isError && !dossier.data ? (
        <ProductionMessage
          role="alert"
          title={t('production.dossier.loadError')}
          detail={
            readProductionError(dossier.error).status === 404
              ? t('production.sheet.notFound')
              : productionErrorText(t, dossier.error)
          }
          action={
            readProductionError(dossier.error).status === 404 ? undefined : (
              <Button variant="outline" className="h-12 pointer-fine:md:h-8" onClick={() => dossier.refetch()}>
                <RefreshCw aria-hidden="true" />
                {t('production.retry')}
              </Button>
            )
          }
        />
      ) : (
        <DossierView dossier={dossier.data} />
      )}
    </ProductionFrame>
  );
}

function DossierSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
