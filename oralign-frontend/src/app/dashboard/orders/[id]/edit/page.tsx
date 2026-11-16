'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderWizard } from '@/components/orders/order-wizard';
import { useOrder } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import {
  buildOrderEditHref,
  isSupplementalOrder,
} from '@/lib/orders/order-navigation';

function EditOrderSkeleton() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function EditOrderPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderQuery = useOrder(params.id);
  const order = orderQuery.data;
  // A supplemental child is never edited here: the initial wizard would
  // send it through the generic update/submit endpoints, which refuse it.
  const redirectHref =
    order && isSupplementalOrder(order) ? buildOrderEditHref(order) : null;

  useEffect(() => {
    if (redirectHref) router.replace(redirectHref);
  }, [redirectHref, router]);

  if (orderQuery.isLoading || redirectHref) {
    return <EditOrderSkeleton />;
  }

  if (orderQuery.error || !order) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardContent className="flex min-h-64 items-center justify-center text-center text-red-600">
            {t('orderEdit.notFound')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col bg-muted/20 p-4 lg:p-6">
      <OrderWizard initialOrder={order} />
    </div>
  );
}
