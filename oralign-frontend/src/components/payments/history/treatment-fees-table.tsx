'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';
import { ReceiptNumberLink } from '@/components/payments/invoice-number-editor';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TreatmentFeeRow } from '@/lib/api/orders.service';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentRecordStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DEFAULT_MERCHANT_CURRENCY, formatPrice } from '@/lib/utils/currency';
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
// dentist rides on the patient's second line.
const COLS = {
  date: 'w-32 pl-4',
  dentist: 'hidden w-36 2xl:table-cell',
  method: 'w-32',
  status: 'w-32',
  amount: 'w-32 text-right',
  receipt: 'w-40 pr-4 text-right',
};

const receiptPath = (row: TreatmentFeeRow) =>
  `/dashboard/orders/${row.orderId}/treatment-fee-invoice`;

/** null when no fee was set; a waived fee is a real 0,000. */
function feeAmount(row: TreatmentFeeRow): string | null {
  return row.amount === null ? null : formatPrice(row.amount, DEFAULT_MERCHANT_CURRENCY);
}

/**
 * The treatment-fees tab: one row per order's fee. A fee is dated by the
 * day it was paid; a bank transfer still to confirm has no such day yet.
 * An admin confirms one from its proof, right here.
 */
export function TreatmentFeesTable({
  rows,
  isAdmin,
  busy,
  returnTo,
  today,
}: {
  rows: TreatmentFeeRow[];
  isAdmin: boolean;
  busy: boolean;
  /** The desk's own URL, for the way back from an order or a receipt. */
  returnTo: string;
  /** Today's business day: a phone row drops the current year. */
  today: string;
}) {
  const { t, lang } = useT();
  const methodLabel = useMethodLabel();
  const [proofRow, setProofRow] = useState<TreatmentFeeRow | null>(null);

  const toConfirm = (row: TreatmentFeeRow) =>
    row.status === PaymentRecordStatus.AWAITING_CONFIRMATION;
  const viewProof = (row: TreatmentFeeRow) =>
    row.proofPath ? () => setProofRow(row) : undefined;

  const phoneAction = (row: TreatmentFeeRow): PhoneRowAction => {
    if (row.status === PaymentRecordStatus.SUCCESS) {
      return { kind: 'receipt', href: withReturnTo(receiptPath(row), returnTo) };
    }
    if (row.proofPath) return { kind: 'proof', onOpen: () => setProofRow(row) };
    return { kind: 'order', href: orderHref(row.orderId, returnTo) };
  };

  return (
    <BusyList busy={busy}>
      <div className={TABLE_FRAME}>
        <Table className="table-fixed">
          <TableCaption className="sr-only">{t('paymentsDesk.list.captionFees')}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ColHead className={COLS.date}>{t('paymentsDesk.list.colDate')}</ColHead>
              {isAdmin && (
                <ColHead className={COLS.dentist}>{t('paymentsDesk.list.colDentist')}</ColHead>
              )}
              <ColHead>{t('paymentsDesk.list.colPatientOrder')}</ColHead>
              <ColHead className={COLS.method}>{t('paymentsDesk.list.colMethod')}</ColHead>
              <ColHead className={COLS.status}>{t('paymentsDesk.list.colStatus')}</ColHead>
              <ColHead className={COLS.amount}>{t('paymentsDesk.list.colAmount')}</ColHead>
              <ColHead className={COLS.receipt}>{t('paymentsDesk.list.colReceipt')}</ColHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const dentist = row.doctor?.fullName ?? null;
              const amount = feeAmount(row);
              return (
                <TableRow key={row.orderId} className="hover:bg-muted/40">
                  <TableCell className={cn('py-2.5', COLS.date)}>
                    {row.paidAt ? (
                      <DateTime iso={row.paidAt} />
                    ) : toConfirm(row) ? (
                      <span className="text-muted-foreground">
                        {t('paymentsDesk.list.toConfirm')}
                      </span>
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className={cn('truncate py-2.5 text-muted-foreground', COLS.dentist)}>
                      {dentist ?? <Dash />}
                    </TableCell>
                  )}
                  <TableCell className="py-2.5">
                    <span className="block truncate font-medium">
                      {row.patient?.fullName ?? '—'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Link
                        href={orderHref(row.orderId, returnTo)}
                        className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {row.orderCode}
                      </Link>
                      {isAdmin && dentist && <span className="2xl:hidden"> · {dentist}</span>}
                    </span>
                  </TableCell>
                  <TableCell className={cn('py-2.5', COLS.method)}>
                    <MethodCell method={row.method} onViewProof={viewProof(row)} />
                  </TableCell>
                  <TableCell className={cn('py-2.5', COLS.status)}>
                    <PaymentStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className={cn('py-2.5 font-medium tabular-nums', COLS.amount)}>
                    {amount ?? <Dash />}
                  </TableCell>
                  <TableCell className={cn('py-2.5', COLS.receipt)}>
                    {row.status === PaymentRecordStatus.SUCCESS ? (
                      <ReceiptNumberLink
                        href={withReturnTo(receiptPath(row), returnTo)}
                        number={row.invoiceNumber}
                        fallback={t('paymentsDesk.list.viewReceipt')}
                        className="inline-block max-w-full align-middle"
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
          // When, who paid (admins), how, then which order. A fee still to
          // confirm has no date: its badge says so.
          const meta = [
            row.paidAt ? dateTimeLine(row.paidAt, lang, today) : null,
            isAdmin ? row.doctor?.fullName : null,
            methodLabel(row.method),
            row.orderCode,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={row.orderId}>
              <PhoneRow
                title={row.patient?.fullName ?? row.orderCode}
                amount={feeAmount(row) ?? '—'}
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
          orderCode={proofRow.orderCode}
          proofPath={proofRow.proofPath}
          amount={proofRow.amount}
          currency={DEFAULT_MERCHANT_CURRENCY}
          doctorName={proofRow.doctor?.fullName ?? null}
          patientName={proofRow.patient?.fullName ?? null}
          method={proofRow.method}
          // A fee has no "declared on" date, only the day it was paid
          // (none while it waits for confirmation): label it as such.
          submittedAt={proofRow.paidAt}
          dateLabel="paid"
          status={proofRow.status}
          canConfirm={isAdmin && toConfirm(proofRow)}
        />
      )}
    </BusyList>
  );
}
