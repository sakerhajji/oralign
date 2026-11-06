import type { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '../exceptions/app.exception';

/**
 * The rows a renamed document may share its number with. An automatic
 * invoice and its payment's receipt print one number by design, so
 * renaming either one never collides with the other, nor with itself.
 */
export interface InvoiceNumberOwner {
  /** The invoice being renamed, or the payment's automatic invoice. */
  invoiceId?: string | null;
  /** The payment whose receipt is renamed, or the invoice's payment. */
  paymentId?: string | null;
}

type InvoiceNumberReader = Pick<
  PrismaService,
  'invoice' | 'payment' | 'dentalOrder' | 'companyBillingSettings'
>;

/**
 * The rules for a document number an admin types, wherever they type it
 * (the invoice desk, the receipt number on the payments desk):
 *   • it prints on no other document. Invoices, installment receipts
 *     (Payment.invoiceNumber) and treatment-fee receipts
 *     (DentalOrder.treatmentFeeInvoiceNumber) are each unique in their own
 *     table only; this check keeps the three apart.
 *   • it stays out of the future range of both automatic counters (FAC-,
 *     TF-). FAC-000150 taken by hand while the counter sits at 100 makes
 *     the 50th automatic allocation collide, and an automatic invoice that
 *     cannot be created leaves a payment without its document.
 * A plain function over Prisma: InvoicesModule imports PaymentsModule, so
 * a shared injectable would close a dependency cycle.
 */
export async function assertInvoiceNumberFree(
  prisma: InvoiceNumberReader,
  candidate: string,
  owner: InvoiceNumberOwner = {},
): Promise<void> {
  const [invoice, receipt, feeReceipt, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true, paymentId: true },
    }),
    prisma.payment.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    }),
    prisma.dentalOrder.findUnique({
      where: { treatmentFeeInvoiceNumber: candidate },
      select: { id: true },
    }),
    prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        invoicePrefix: true,
        invoiceNextNumber: true,
        treatmentFeeInvoicePrefix: true,
        treatmentFeeInvoiceNextNumber: true,
      },
    }),
  ]);

  const ownInvoice =
    invoice !== null &&
    (invoice.id === owner.invoiceId ||
      (Boolean(owner.paymentId) && invoice.paymentId === owner.paymentId));
  const ownReceipt = receipt !== null && receipt.id === owner.paymentId;
  if ((invoice && !ownInvoice) || (receipt && !ownReceipt) || feeReceipt) {
    throw invoiceNumberTaken(candidate);
  }

  if (!settings) return;
  const counters: [prefix: string, next: number][] = [
    [settings.invoicePrefix || 'FAC', settings.invoiceNextNumber],
    [
      settings.treatmentFeeInvoicePrefix || 'TF',
      settings.treatmentFeeInvoiceNextNumber,
    ],
  ];
  for (const [prefix, next] of counters) {
    const head = `${prefix}-`;
    if (!candidate.startsWith(head)) continue;
    const tail = candidate.slice(head.length);
    if (/^\d+$/.test(tail) && Number(tail) >= next) {
      throw new ConflictException(
        `Invoice number ${candidate} is inside the automatic ${prefix} sequence (next: ${head}${String(next).padStart(6, '0')}). Pick a number below it or a different prefix.`,
        'INVOICE_NUMBER_RESERVED',
      );
    }
  }
}

/** The 409 of a number another document already prints. */
export function invoiceNumberTaken(candidate: string): ConflictException {
  return new ConflictException(
    `Invoice number ${candidate} is already used by another invoice or receipt.`,
    'INVOICE_NUMBER_TAKEN',
  );
}
