import { Suspense } from 'react';
import { ClicToPayResult } from '@/components/payments/clictopay-result';

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <ClicToPayResult />
    </Suspense>
  );
}
