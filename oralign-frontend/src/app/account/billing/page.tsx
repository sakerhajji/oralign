import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCardIcon } from 'lucide-react';

/**
 * Account → Payment history.
 *
 * Placeholder page — the full billing module (invoices, payment methods,
 * subscription state) is on the roadmap. The route exists so the
 * sidebar's "Payment History" link doesn't 404 and so the URL stays
 * stable when the feature ships.
 */
export default function AccountBillingPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCardIcon className="h-5 w-5 text-primary" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">
              No invoices yet.
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Once your first order is processed and billed, every invoice
              and payment will appear here with a downloadable PDF receipt.
              For invoice questions in the meantime, contact your clinic
              account manager.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
