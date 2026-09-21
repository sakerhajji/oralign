import { Suspense } from 'react';
import { ClicToPayResult } from '@/components/payments/clictopay-result';

export default function PaymentFailPage() {
  return (
    <Suspense fallback={null}>
      <ClicToPayResult />
    </Suspense>
  );
}
