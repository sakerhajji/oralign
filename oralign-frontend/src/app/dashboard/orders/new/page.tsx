'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OrderWizard } from '@/components/orders/order-wizard';

// Patient ids are UUIDs. Anything else in the link is dropped here rather
// than sent to the API as a lookup that can only fail.
const PATIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?patientId=<id>` opens the wizard with that patient already chosen. */
function NewOrderWizard() {
  const patientId = useSearchParams().get('patientId');
  return (
    <OrderWizard
      initialPatientId={
        patientId && PATIENT_ID_PATTERN.test(patientId)
          ? patientId.toLowerCase()
          : undefined
      }
    />
  );
}

export default function NewOrderPage() {
  return (
    <div className="@container/main flex flex-1 flex-col bg-muted/20 p-4 lg:p-6">
      {/* Reading the query through `useSearchParams` (not the page's
          `searchParams` prop) keeps the route static, so the sidebar's
          prefetched "New order" stays instant; it needs this boundary,
          whose empty fallback only shows on a hard load, before hydration. */}
      <Suspense fallback={null}>
        <NewOrderWizard />
      </Suspense>
    </div>
  );
}
