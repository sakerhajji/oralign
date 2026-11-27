import { InstallmentStatus, PaymentRecordStatus } from '@prisma/client';
import {
  installmentTransferState,
  TRANSFER_STATES,
  transferStateOf,
  treatmentFeeTransferState,
} from './transfer-state';

const opened = new Date('2026-11-27T08:00:00.000Z');

describe('transferStateOf (the five spec states, derived)', () => {
  it.each([
    [PaymentRecordStatus.awaiting_confirmation, null, 'receipt_sent'],
    [PaymentRecordStatus.awaiting_confirmation, opened, 'to_verify'],
    [
      PaymentRecordStatus.awaiting_confirmation,
      opened.toISOString(),
      'to_verify',
    ],
    [PaymentRecordStatus.success, null, 'paid'],
    [PaymentRecordStatus.rejected, opened, 'refused'],
    [PaymentRecordStatus.cancelled, opened, 'awaiting_receipt'],
    [PaymentRecordStatus.failed, null, 'awaiting_receipt'],
    [PaymentRecordStatus.expired, null, 'awaiting_receipt'],
    [PaymentRecordStatus.pending, null, 'awaiting_receipt'],
    [PaymentRecordStatus.unknown, null, 'awaiting_receipt'],
    [null, null, 'awaiting_receipt'],
    [undefined, undefined, 'awaiting_receipt'],
  ])('%p, reviewOpenedAt %p → %p', (status, reviewOpenedAt, state) => {
    expect(transferStateOf({ status, reviewOpenedAt })).toBe(state);
  });

  it('only ever answers one of the five states', () => {
    for (const status of [...Object.values(PaymentRecordStatus), null]) {
      expect(TRANSFER_STATES).toContain(
        transferStateOf({ status, reviewOpenedAt: null }),
      );
    }
  });
});

describe('installmentTransferState', () => {
  it('a paid installment is paid whatever its last transfer says (cash, card)', () => {
    expect(
      installmentTransferState(InstallmentStatus.paid, {
        status: PaymentRecordStatus.rejected,
        reviewOpenedAt: null,
      }),
    ).toBe('paid');
  });

  it('nothing is owed on a cancelled installment', () => {
    expect(
      installmentTransferState(InstallmentStatus.cancelled, null),
    ).toBeNull();
  });

  it('otherwise the latest declaration decides; none = awaiting the receipt', () => {
    expect(installmentTransferState(InstallmentStatus.pending, null)).toBe(
      'awaiting_receipt',
    );
    expect(
      installmentTransferState(InstallmentStatus.overdue, {
        status: PaymentRecordStatus.awaiting_confirmation,
        reviewOpenedAt: opened,
      }),
    ).toBe('to_verify');
  });
});

describe('treatmentFeeTransferState', () => {
  it('reads the order columns', () => {
    expect(
      treatmentFeeTransferState({
        treatmentFeePaidAt: null,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
        treatmentFeeReviewOpenedAt: null,
      }),
    ).toBe('receipt_sent');
    expect(
      treatmentFeeTransferState({
        treatmentFeePaidAt: null,
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeReviewOpenedAt: opened,
      }),
    ).toBe('refused');
  });

  it('a paid date wins (card and cash fees)', () => {
    expect(
      treatmentFeeTransferState({
        treatmentFeePaidAt: opened,
        treatmentFeePaymentStatus: null,
        treatmentFeeReviewOpenedAt: null,
      }),
    ).toBe('paid');
  });
});
