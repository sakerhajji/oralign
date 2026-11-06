'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import {
  Banknote,
  CreditCard,
  FileText,
  Landmark,
  ReceiptText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePendingTreatmentFees } from '@/lib/hooks';
import type { TreatmentFeeRow } from '@/lib/api/orders.service';
import { PaymentMethod } from '@/lib/types';
import {
  DEFAULT_MERCHANT_CURRENCY,
  formatPrice,
} from '@/lib/utils/currency';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Maps `PaymentMethod` → method icon + Tailwind color set. Labels come
 * from the i18n dictionary at render time so a doctor and an admin see
 * the same vocabulary across every payments surface.
 */
const METHOD_META: Record<
  PaymentMethod,
  { Icon: typeof CreditCard; tone: string }
> = {
  [PaymentMethod.CARD]: {
    Icon: CreditCard,
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [PaymentMethod.BANK_TRANSFER]: {
    Icon: Landmark,
    tone: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  [PaymentMethod.CASH]: {
    Icon: Banknote,
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

function PaymentMethodBadge({
  method,
}: {
  method: PaymentMethod | null;
}) {
  const { t } = useT();
  if (!method) return <span className="text-muted-foreground">—</span>;
  const meta = METHOD_META[method];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.tone}`}
    >
      <meta.Icon className="size-3" />
      {t(`paymentsCommon.method.${method}`)}
    </span>
  );
}

/**
 * The queue's table. `renderActions` slots in the right-edge buttons
 * (Review & confirm).
 */
function TreatmentFeeTable({
  rows,
  isLoading,
  emptyMessage,
  renderActions,
  onViewProof,
}: {
  rows: TreatmentFeeRow[];
  isLoading: boolean;
  emptyMessage: string;
  renderActions: (row: TreatmentFeeRow) => React.ReactNode;
  /**
   * Optional click handler for the "View" button in the Proof column.
   * Renders a clickable affordance ONLY for bank-transfer rows that
   * carry a `proofPath`; non-bank-transfer rows always render a dash
   * because there is nothing to view. Wiring is opt-in so we don't
   * force every consumer to handle the dialog state.
   */
  onViewProof?: (row: TreatmentFeeRow) => void;
}) {
  const { t, lang } = useT();
  const dateLocale: Locale | undefined = lang === 'fr' ? frLocale : undefined;
  const dateFmt = lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy';
  const shortDateFmt = lang === 'fr' ? 'd MMM' : 'MMM d';

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('paymentsCommon.columns.order')}</TableHead>
          <TableHead>{t('paymentsCommon.columns.doctorSlashPatient')}</TableHead>
          <TableHead>{t('paymentsCommon.columns.method')}</TableHead>
          <TableHead>{t('paymentsCommon.columns.status')}</TableHead>
          <TableHead className="text-right">
            {t('paymentsCommon.columns.amount')}
          </TableHead>
          <TableHead>{t('paymentsCommon.columns.date')}</TableHead>
          {/*
            Proof column — meaningful only for bank-transfer rows. Card
            and cash rows always render "—" because there's no proof
            file to show. The button opens the shared
            TreatmentFeeReceiptDialog (same viewer the admin uses on
            the pending queue) so doctor-uploaded photos / PDFs render
            inline with click-to-zoom.
           */}
          <TableHead>{t('paymentsCommon.columns.proof')}</TableHead>
          <TableHead className="text-right">
            {t('paymentsCommon.columns.actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.orderId}>
            <TableCell className="font-medium">
              <Link
                href={`/dashboard/orders/${row.orderId}`}
                className="hover:underline"
              >
                {row.orderCode}
              </Link>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                {row.doctor?.fullName ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.patient?.fullName ?? ''}
              </div>
            </TableCell>
            <TableCell>
              <PaymentMethodBadge method={row.method} />
            </TableCell>
            <TableCell>
              <PaymentStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.amount !== null ? formatPrice(row.amount) : '—'}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.paidAt
                ? format(new Date(row.paidAt), dateFmt, { locale: dateLocale })
                : row.submittedAt
                  ? t('paymentsCommon.submittedShort', {
                      date: format(new Date(row.submittedAt), shortDateFmt, {
                        locale: dateLocale,
                      }),
                    })
                  : '—'}
            </TableCell>
            <TableCell>
              {row.method === PaymentMethod.BANK_TRANSFER && row.proofPath && onViewProof ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => onViewProof(row)}
                  title={t('paymentsCommon.actions.viewReceipt')}
                >
                  <FileText className="size-3" />
                  {t('paymentsCommon.actions.view')}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">{renderActions(row)}</div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "Treatment fees awaiting confirmation" — drop into the admin
 * /payments/pending page above the existing installment queue.
 * Renders nothing when there's nothing pending so the page doesn't
 * sprout an empty card on a clean queue.
 */
export function PendingTreatmentFeesSection() {
  const { t } = useT();
  const { data, isLoading } = usePendingTreatmentFees({ page: 1, limit: 20 });
  const rows = data?.data ?? [];
  // The currently-opened row drives the viewer modal. Holding the
  // full row lets us pass amount + doctor / patient context for the
  // dialog header without re-fetching.
  const [active, setActive] = useState<TreatmentFeeRow | null>(null);

  if (!isLoading && rows.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="size-5 text-primary" />
                {t('paymentsPending.treatmentFeesPendingTitle')}
              </CardTitle>
              <CardDescription>
                {t('paymentsPending.treatmentFeesPendingDesc')}
              </CardDescription>
            </div>
            {data?.total ? (
              <Badge variant="secondary">
                {t('paymentsPending.treatmentFeesPendingCount', {
                  count: data.total,
                })}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TreatmentFeeTable
            rows={rows}
            isLoading={isLoading}
            emptyMessage={t('paymentsPending.treatmentFeesPendingEmpty')}
            onViewProof={(row) => setActive(row)}
            renderActions={(row) => (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5"
                onClick={() => setActive(row)}
              >
                <ReceiptText className="size-4" />
                {t('paymentsPending.reviewAndConfirm')}
              </Button>
            )}
          />
        </CardContent>
      </Card>

      {/*
        Single shared dialog instance — mounted only while a row is
        active so the blob-fetch hook doesn't churn on every render.
        Closes itself on confirm, which invalidates the queries so
        the row hops from pending → history.
       */}
      {active && (
        <TreatmentFeeReceiptDialog
          open={!!active}
          onOpenChange={(next) => {
            if (!next) setActive(null);
          }}
          orderId={active.orderId}
          orderCode={active.orderCode}
          proofPath={active.proofPath}
          amount={active.amount}
          currency={DEFAULT_MERCHANT_CURRENCY}
          doctorName={active.doctor?.fullName ?? null}
          patientName={active.patient?.fullName ?? null}
          method={active.method}
          submittedAt={active.submittedAt ?? active.updatedAt ?? null}
          canConfirm
        />
      )}
    </>
  );
}

