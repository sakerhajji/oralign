'use client';

import { useParams } from 'next/navigation';
import { CaseSheetContent } from './case-sheet-content';

export default function ProductionCasePage() {
  const params = useParams<{ orderId: string }>();
  return <CaseSheetContent orderId={params.orderId} />;
}
