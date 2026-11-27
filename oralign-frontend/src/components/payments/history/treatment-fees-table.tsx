'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ReceiptNumberLink } from '@/components/payments/invoice-number-editor';
import { ReceiptSummary, ReceiptViewerDialog } from '@/components/payments/receipt-viewer';
import {
  AmountWithWithholding,
  recordedSplit,
  recordedSplitParts,
} from '@/components/payments/withholding';
import { Button } from '@/components/ui/button';
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
import { treatmentFeeTransferState } from '@/lib/payments/transfer-state';
import { PaymentRecordStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBusinessDayShort } from '@/lib/utils/business-day';
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
  TransferStatusCell,
  dateTimeLine,
  orderHref,
  refusalPart,
  transferStatusBadge,
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
  // « En cours de vérification » on one line, a refusal's reason under it.
  status: 'w-48',
  amount: 'w-32 text-right',
  receipt: 'w-40 pr-4 text-right',
};

const PENDING_QUEUE = '/dashboard/payments/pending';

const receiptPath = (row: TreatmentFeeRow) =>
  `/dashboard/orders/${row.orderId}/treatment-fee-invoice`;

/**
 * A fee row may carry the retenue à la source the practitioner applied
 * (its amount is then the cash, net of it). Optional: older API rows have
 * neither field.
 */
type FeeRow = TreatmentFeeRow & {
  withholdingAmount?: number | string | null;
  withholdingRate?: number | string | null;
};

/** null when no fee was set; a waived fee is a real 0,000. */
function feeAmount(row: FeeRow): string | null {
  return row.amount === null ? null : formatPrice(row.amount, DEFAULT_MERCHANT_CURRENCY);
}

/** Fee (+ CBCT) TTC, the stamp added and the retenue kept back, or null on an older row. */
const feeSplit = (row: FeeRow) =>
  recordedSplit(row.amount, row.withholdingAmount, row.withholdingRate, row.stampAmount);

/**
 * Whether a fee receipt is attached: `hasProof` (P-A), else the stored
 * path the owner and admins still receive from an older API.
 */
const hasProof = (row: TreatmentFeeRow) => row.hasProof ?? !!row.proofPath;

/** The fee's derived transfer state: the server's, else from its columns. */
const stateOf = (row: TreatmentFeeRow) =>
  row.state ??
  treatmentFeeTransferState({
    treatmentFeePaidAt: row.paidAt,
    treatmentFeePaymentStatus: row.status,
    treatmentFeeReviewOpenedAt: row.reviewOpenedAt ?? null,
  });

/**
 * The treatment-fees tab: one row per order's fee. A fee is dated by the
 * day it was paid; a bank transfer still to confirm (or refused) has no
 * such day, only the day its receipt was sent. The receipt opens through
 * the authenticated stream; an admin confirms or refuses a transfer in
 * the pending desk, where the review is recorded.
 */
export function TreatmentFeesTable({
  rows,
  isAdmin,
  busy,
  returnTo,
  today,
}: {
  rows: FeeRow[];
  isAdmin: boolean;
  busy: boolean;
  /** The desk's own URL, for the way back from an order or a receipt. */
  returnTo: string;
  /** Today's business day: a phone row drops the current year. */
  today: string;
}) {
  const { t, lang } = useT();
  const methodLabel = useMethodLabel();
  const [proofRow, setProofRow] = useState<FeeRow | null>(null);

  const toConfirm = (row: TreatmentFeeRow) =>
    row.status === PaymentRecordStatus.AWAITING_CONFIRMATION;
  const viewProof = (row: TreatmentFeeRow) =>
    hasProof(row) ? () => setProofRow(row) : undefined;
  /** « Envoyé le 6 nov. » of a transfer not paid yet (awaiting or refused). */
  const sentLine = (row: TreatmentFeeRow) =>
    !row.paidAt && row.declaredAt
      ? t('transfers.history.sentOn', {
          date: formatBusinessDayShort(row.declaredAt, lang, today),
        })
      : null;

  const phoneAction = (row: TreatmentFeeRow): PhoneRowAction => {
    if (row.status === PaymentRecordStatus.SUCCESS) {
      return { kind: 'receipt', href: withReturnTo(receiptPath(row), returnTo) };
    }
    if (hasProof(row)) return { kind: 'proof', onOpen: () => setProofRow(row) };
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
                    ) : toConfirm(row) || sentLine(row) ? (
                      <>
                        {toConfirm(row) ? (
                          <span className="block truncate text-muted-foreground">
                            {t('paymentsDesk.list.toConfirm')}
                          </span>
                        ) : null}
                        {sentLine(row) ? (
                          <span className="block truncate text-xs text-muted-foreground tabular-nums">
                            {sentLine(row)}
                          </span>
                        ) : null}
                      </>
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
                    <TransferStatusCell
                      status={row.status}
                      method={row.method}
                      reviewOpenedAt={row.reviewOpenedAt}
                      rejectionReason={row.rejectionReason}
                      audience={isAdmin ? 'admin' : 'doctor'}
                    />
                  </TableCell>
                  <TableCell className={cn('py-2.5 font-medium tabular-nums', COLS.amount)}>
                    {amount === null ? (
                      <Dash />
                    ) : (
                      <AmountWithWithholding
                        cash={row.amount}
                        split={feeSplit(row)}
                        currency={DEFAULT_MERCHANT_CURRENCY}
                        kind="fee"
                        className="items-end"
                      />
                    )}
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
          const split = feeSplit(row);
          // When, who paid (admins), how, then which order. A fee still to
          // confirm has no date: its badge says so. With a stamp or a
          // retenue, the fee, the stamp and the retenue last.
          const meta = [
            // A refusal says why first: it is what the doctor acts on.
            refusalPart(row.status, row.rejectionReason, t),
            row.paidAt ? dateTimeLine(row.paidAt, lang, today) : sentLine(row),
            isAdmin ? row.doctor?.fullName : null,
            methodLabel(row.method),
            row.orderCode,
            ...recordedSplitParts(split, DEFAULT_MERCHANT_CURRENCY, t, 'fee'),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={row.orderId}>
              <PhoneRow
                title={row.patient?.fullName ?? row.orderCode}
                amount={feeAmount(row) ?? '—'}
                status={transferStatusBadge(
                  row.status,
                  row.method,
                  row.reviewOpenedAt,
                  isAdmin ? 'admin' : 'doctor',
                )}
                meta={meta}
                action={phoneAction(row)}
              />
            </li>
          );
        })}
      </ul>

      {proofRow && (
        <ReceiptViewerDialog
          open
          onOpenChange={(open) => {
            if (!open) setProofRow(null);
          }}
          source={{ kind: 'treatment_fee', orderId: proofRow.orderId }}
          // A replaced receipt is fetched again.
          version={proofRow.declaredAt ?? proofRow.updatedAt}
          description={t('transfers.viewer.descFee', { code: proofRow.orderCode })}
          fileBaseName={proofRow.orderCode}
          details={
            <ReceiptSummary
              state={stateOf(proofRow)}
              status={proofRow.status}
              audience={isAdmin ? 'admin' : 'doctor'}
              cash={proofRow.amount}
              split={feeSplit(proofRow)}
              currency={DEFAULT_MERCHANT_CURRENCY}
              kind="fee"
              sentAt={proofRow.declaredAt ?? null}
              rejectionReason={proofRow.rejectionReason}
              patientName={proofRow.patient?.fullName ?? null}
            />
          }
          // A fee transfer is confirmed or refused in the pending desk,
          // where the lab's review is recorded; this viewer shows the
          // receipt and, to an admin, the way there.
          footerAction={
            isAdmin && toConfirm(proofRow) ? (
              <Button asChild variant="outline" className="h-11 sm:h-9 pointer-coarse:h-12">
                <Link href={PENDING_QUEUE}>{t('paymentsDesk.list.confirmInQueue')}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </BusyList>
  );
}
