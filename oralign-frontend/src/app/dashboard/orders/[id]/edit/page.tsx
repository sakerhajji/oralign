'use client';

import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderWizard } from '@/components/orders/order-wizard';
import { useOrder } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

export default function EditOrderPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const orderQuery = useOrder(params.id);

  if (orderQuery.isLoading) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
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
      <OrderWizard initialOrder={orderQuery.data} />
    </div>
  );
}
