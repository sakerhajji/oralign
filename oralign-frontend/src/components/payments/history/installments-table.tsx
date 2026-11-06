'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';
import { InvoiceNumberEditor } from '@/components/payments/invoice-number-editor';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentRecordStatus, type PaymentListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import {
  BusyList,
  ColHead,
  Dash,
  DateTime,
  MethodCell,
  PHONE_LIST,
  PhoneRow,
  TABLE_FRAME,
  dateTimeLine,
  orderHref,
  useMethodLabel,
  withReturnTo,
  type PhoneRowAction,
} from './row-parts';

// Fixed widths, each sized to its longest value (EN included); the
// patient column, the row's identity, takes the rest. Below 2xl the
// dentist and the installment number ride on the patient's second line,
// so the identity column is never the narrow one.
const COLS = {
  date: 'w-32 pl-4',
  dentist: 'hidden w-36 2xl:table-cell',
  installment: 'hidden w-20 2xl:table-cell',
  method: 'w-32',
  // "Vérification requise" / "Verification required" on one line.
  status: 'w-40',
  amount: 'w-32 text-right',
  // Room for the admin's inline number editor.
  receiptAdmin: 'w-48 pr-4 text-right',
  receipt: 'w-40 pr-4 text-right',
};

const PENDING_QUEUE = '/dashboard/payments/pending';

const receiptPath = (row: PaymentListItem) => `/dashboard/payments/${row.id}/invoice`;

/**
 * The date a payment happened: when it was paid, otherwise when it was
 * made (the attempt, the declared transfer). The list is ordered by it
 * (sortBy=eventAt) and the period filters on it.
 */
const eventDate = (row: PaymentListItem) => row.paidAt ?? row.createdAt;

/**
 * The installments tab: quote installment payments, one row per attempt,
 * dated by `eventDate`. Only a paid row has a receipt, and only there can
 * an admin renumber it.
 */
export function InstallmentsTable({
  rows,
  isAdmin,
  busy,
  returnTo,
  today,
}: {
  rows: PaymentListItem[];
  isAdmin: boolean;
  busy: boolean;
  /** The desk's own URL, for the way back from an order or a receipt. */
  returnTo: string;
  /** Today's business day: a phone row drops the current year. */
  today: string;
}) {
  const { t, lang } = useT();
  const methodLabel = useMethodLabel();
  // One proof viewer for the whole list, mounted only while open.
  const [proofRow, setProofRow] = useState<PaymentListItem | null>(null);

  const viewProof = (row: PaymentListItem) =>
    row.proofUrl ? () => setProofRow(row) : undefined;

  const phoneAction = (row: PaymentListItem): PhoneRowAction => {
    if (row.status === PaymentRecordStatus.SUCCESS) {
      return { kind: 'receipt', href: withReturnTo(receiptPath(row), returnTo) };
    }
    if (row.proofUrl) return { kind: 'proof', onOpen: () => setProofRow(row) };
    return { kind: 'order', href: orderHref(row.orderId, returnTo, 'quote') };
  };

  return (
    <BusyList busy={busy}>
      <div className={TABLE_FRAME}>
        <Table className="table-fixed">
          <TableCaption className="sr-only">
            {t('paymentsDesk.list.captionInstallments')}
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ColHead className={COLS.date}>{t('paymentsDesk.list.colDate')}</ColHead>
              {isAdmin && (
                <ColHead className={COLS.dentist}>{t('paymentsDesk.list.colDentist')}</ColHead>
              )}
              <ColHead>{t('paymentsDesk.list.colPatientOrder')}</ColHead>
              <ColHead className={COLS.installment}>
                {t('paymentsDesk.list.colInstallment')}
              </ColHead>
              <ColHead className={COLS.method}>{t('paymentsDesk.list.colMethod')}</ColHead>
              <ColHead className={COLS.status}>{t('paymentsDesk.list.colStatus')}</ColHead>
              <ColHead className={COLS.amount}>{t('paymentsDesk.list.colAmount')}</ColHead>
              <ColHead className={isAdmin ? COLS.receiptAdmin : COLS.receipt}>
                {t('paymentsDesk.list.colReceipt')}
              </ColHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const dentist = row.order?.doctor?.fullName ?? null;
              const installment = row.installment?.installmentNumber;
              // Below 2xl the dentist and the installment ride on the
              // patient's second line instead of their own columns.
              const folded = [
                installment !== undefined
                  ? t('paymentsDesk.list.installmentInline', { n: installment })
                  : null,
                isAdmin ? dentist : null,
              ].filter(Boolean);
              return (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  <TableCell className={cn('py-2.5', COLS.date)}>
                    <DateTime iso={eventDate(row)} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className={cn('truncate py-2.5 text-muted-foreground', COLS.dentist)}>
                      {dentist ?? <Dash />}
                    </TableCell>
                  )}
                  <TableCell className="py-2.5">
                    <span className="block truncate font-medium">
                      {row.order?.patient?.fullName ?? '—'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.order?.orderCode ? (
                        <Link
                          href={orderHref(row.orderId, returnTo, 'quote')}
                          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {row.order.orderCode}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {folded.length > 0 && (
                        <span className="2xl:hidden"> · {folded.join(' · ')}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={cn('py-2.5 text-muted-foreground tabular-nums', COLS.installment)}>
                    {installment !== undefined ? (
                      t('paymentsDesk.list.installmentNo', { n: installment })
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell className={cn('py-2.5', COLS.method)}>
                    <MethodCell method={row.paymentMethod} onViewProof={viewProof(row)} />
                  </TableCell>
                  <TableCell className={cn('py-2.5', COLS.status)}>
                    <PaymentStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className={cn('py-2.5 font-medium tabular-nums', COLS.amount)}>
                    {formatPrice(row.amount, row.currency)}
                  </TableCell>
                  <TableCell className={cn('py-2.5', isAdmin ? COLS.receiptAdmin : COLS.receipt)}>
                    {row.status === PaymentRecordStatus.SUCCESS ? (
                      <InvoiceNumberEditor
                        paymentId={row.id}
                        value={row.invoiceNumber}
                        canEdit={isAdmin}
                        href={withReturnTo(receiptPath(row), returnTo)}
                        fallback={t('paymentsDesk.list.viewReceipt')}
                        className="max-w-full justify-end"
                      />
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className={PHONE_LIST}>
        {rows.map((row) => {
          const installment = row.installment?.installmentNumber;
          // When, who paid (admins), how, then which order and installment.
          const meta = [
            dateTimeLine(eventDate(row), lang, today),
            isAdmin ? row.order?.doctor?.fullName : null,
            methodLabel(row.paymentMethod),
            row.order?.orderCode,
            installment !== undefined
              ? t('paymentsDesk.list.installmentInline', { n: installment })
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={row.id}>
              <PhoneRow
                title={row.order?.patient?.fullName ?? row.order?.orderCode ?? '—'}
                amount={formatPrice(row.amount, row.currency)}
                status={<PaymentStatusBadge status={row.status} />}
                meta={meta}
                action={phoneAction(row)}
              />
            </li>
          );
        })}
      </ul>

      {proofRow && (
        <TreatmentFeeReceiptDialog
          open
          onOpenChange={(open) => {
            if (!open) setProofRow(null);
          }}
          orderId={proofRow.orderId}
          orderCode={proofRow.order?.orderCode ?? '—'}
          proofPath={proofRow.proofUrl ?? null}
          amount={Number(proofRow.amount)}
          currency={proofRow.currency}
          doctorName={proofRow.order?.doctor?.fullName ?? null}
          patientName={proofRow.order?.patient?.fullName ?? null}
          method={proofRow.paymentMethod}
          submittedAt={proofRow.declaredAt ?? proofRow.createdAt}
          status={proofRow.status}
          // An installment transfer is confirmed from the confirmation
          // queue, with its notes; this viewer shows the proof and, to an
          // admin, the way there.
          canConfirm={false}
          footerAction={
            isAdmin && proofRow.status === PaymentRecordStatus.AWAITING_CONFIRMATION ? (
              <Button asChild variant="outline">
                <Link href={PENDING_QUEUE}>{t('paymentsDesk.list.confirmInQueue')}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </BusyList>
  );
}
