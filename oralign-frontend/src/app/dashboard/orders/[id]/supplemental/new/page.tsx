'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { SupplementalWizard } from '@/components/orders/supplemental';
import { SUPPLEMENTAL_WIZARD_QUERY } from '@/lib/orders/order-navigation';

function SupplementalWizardRoute() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  return (
    <SupplementalWizard
      parentOrderId={id}
      requestedType={search.get(SUPPLEMENTAL_WIZARD_QUERY.type)}
      requestId={search.get(SUPPLEMENTAL_WIZARD_QUERY.requestId)}
    />
  );
}

export default function NewSupplementalOrderPage() {
  return (
    <div className="@container/main flex flex-1 flex-col bg-muted/20 p-4 lg:p-6">
      {/* `useSearchParams` keeps the route static; it needs this boundary,
          whose empty fallback only shows on a hard load before hydration. */}
      <Suspense fallback={null}>
        <SupplementalWizardRoute />
      </Suspense>
    </div>
  );
}
