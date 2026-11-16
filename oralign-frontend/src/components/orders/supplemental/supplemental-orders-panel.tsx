'use client';

import { useState, type ReactNode } from 'react';
import { ClipboardPlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupplementalOrders } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import type { SupplementalOrderView } from '@/lib/types';
import { DeleteDraftDialog } from './delete-draft-dialog';
import { isSupplementalKind } from './supplemental-constants';
import { SupplementalOrderActions } from './supplemental-order-actions';
import { SupplementalRequestRow } from './supplemental-request-row';

/**
 * Requests linked to an initial case, with the "Nouvelle demande" menu.
 * The case page's wrapper owns the `#supplemental-requests` anchor.
 */
export function SupplementalOrdersPanel({ parentOrderId }: { parentOrderId: string }) {
  const { t } = useT();
  const list = useSupplementalOrders(parentOrderId);
  const [deleting, setDeleting] = useState<SupplementalOrderView | null>(null);

  let body: ReactNode;
  if (list.isPending) {
    body = (
      <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (list.isError) {
    body = (
      <div className="flex flex-col items-start gap-3 px-4 py-5 sm:px-5">
        <p className="text-sm text-muted-foreground">{t('supplemental.panel.loadError')}</p>
        <Button type="button" variant="outline" className="h-11" onClick={() => void list.refetch()}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
          {t('supplemental.actions.retry')}
        </Button>
      </div>
    );
  } else if (list.data.length === 0) {
    body = <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">{t('supplemental.noRequests')}</p>;
  } else {
    body = (
      <ul className="divide-y">
        {list.data.map((view) => {
          const kind = view.order.orderType;
          return isSupplementalKind(kind) ? (
            <li key={view.order.id}>
              <SupplementalRequestRow view={view} kind={kind} onDelete={setDeleting} />
            </li>
          ) : null;
        })}
      </ul>
    );
  }

  return (
    <>
      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border">
                <ClipboardPlus className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base">{t('supplemental.sectionTitle')}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t('supplemental.sectionHint')}</p>
              </div>
            </div>
            <SupplementalOrderActions parentOrderId={parentOrderId} />
          </div>
        </CardHeader>
        <CardContent className="p-0">{body}</CardContent>
      </Card>
      <DeleteDraftDialog view={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
