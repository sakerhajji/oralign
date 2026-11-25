'use client';

import { useParams } from 'next/navigation';
import { DossierContent } from './dossier-content';

export default function ProductionDossierPage() {
  const params = useParams<{ orderId: string }>();
  return <DossierContent orderId={params.orderId} />;
}
