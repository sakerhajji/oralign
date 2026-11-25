/**
 * The transaction ids PaymentsService invents when nobody typed a
 * reference: `cash_<uuid>` / `cheque_<uuid>` (recordCash), `bank_<uuid>`
 * (confirmBankTransfer) and `mock_cb_<uuid>` (the dev callback). They only
 * keep the column filled; nobody can look them up on a statement, so a
 * facture printing "Réf. cash_1b9d…" tells the reader nothing true.
 *
 * Mirrored by migration 20261119000002_billing_backfill_fixes, which nulls
 * the ones already copied into Invoice.paymentReference: keep both in step.
 */
const SYNTHETIC_TRANSACTION_ID = /^(cash|cheque|bank|mock_cb)_[0-9a-f-]{36}$/;

export function isSyntheticTransactionId(
  value: string | null | undefined,
): boolean {
  return Boolean(value && SYNTHETIC_TRANSACTION_ID.test(value.trim()));
}

/**
 * The payment reference an invoice stores and prints: the payment's own
 * reference (provider order id, bank or cheque reference typed by the
 * admin), or null when there is none — never a generated placeholder.
 */
export function invoicePaymentReference(
  transactionId: string | null | undefined,
): string | null {
  const reference = transactionId?.trim();
  if (!reference || isSyntheticTransactionId(reference)) return null;
  return reference;
}
