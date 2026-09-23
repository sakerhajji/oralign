'use client';

import { useParams } from 'next/navigation';
import { InvoiceFormScreen } from '../../invoice-form-screen';

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  return <InvoiceFormScreen invoiceId={params.id} />;
}
