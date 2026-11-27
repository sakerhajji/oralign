// Run: node --test src/lib/payments/transfer-state.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The derived transfer states must read exactly like the backend's
// (oralign-backend/src/payments/services/transfer-state.ts and its spec):
// a doctor's panel and the admin queue never disagree on one transfer.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRANSFER_STATES,
  TRANSFER_STATE_TONE,
  installmentTransferOf,
  installmentTransferState,
  isTransferInFlight,
  isTransferPayable,
  refusalReasonOf,
  transferStateLabelKey,
  transferStateOf,
  treatmentFeeTransferState,
} from './transfer-state.ts';

const OPENED = '2026-11-27T09:00:00.000Z';

describe('transferStateOf', () => {
  it('maps the five spec states like the backend', () => {
    assert.equal(transferStateOf({ status: 'success', reviewOpenedAt: null }), 'paid');
    assert.equal(transferStateOf({ status: 'rejected', reviewOpenedAt: OPENED }), 'refused');
    assert.equal(transferStateOf({ status: 'awaiting_confirmation', reviewOpenedAt: null }), 'receipt_sent');
    assert.equal(transferStateOf({ status: 'awaiting_confirmation', reviewOpenedAt: OPENED }), 'to_verify');
  });

  it('reads every other status, and none, as awaiting a receipt', () => {
    for (const status of ['pending', 'unknown', 'failed', 'cancelled', 'expired', null, undefined]) {
      assert.equal(transferStateOf({ status, reviewOpenedAt: OPENED }), 'awaiting_receipt', String(status));
    }
  });

  it('treats a missing reviewOpenedAt as not opened', () => {
    assert.equal(transferStateOf({ status: 'awaiting_confirmation' }), 'receipt_sent');
  });
});

describe('installmentTransferState', () => {
  it('is paid once the installment is paid, whatever the declaration says', () => {
    assert.equal(installmentTransferState('paid', { status: 'rejected', reviewOpenedAt: null }), 'paid');
    assert.equal(installmentTransferState('paid', null), 'paid');
  });

  it('is null for a cancelled installment (nothing owed)', () => {
    assert.equal(installmentTransferState('cancelled', { status: 'awaiting_confirmation' }), null);
  });

  it('follows the latest declaration of a pending or overdue installment', () => {
    assert.equal(installmentTransferState('pending', null), 'awaiting_receipt');
    assert.equal(installmentTransferState('overdue', { status: 'rejected' }), 'refused');
    assert.equal(
      installmentTransferState('pending', { status: 'awaiting_confirmation', reviewOpenedAt: OPENED }),
      'to_verify',
    );
  });
});

describe('treatmentFeeTransferState', () => {
  it('is paid once treatmentFeePaidAt is set', () => {
    assert.equal(
      treatmentFeeTransferState({ treatmentFeePaidAt: OPENED, treatmentFeePaymentStatus: 'awaiting_confirmation' }),
      'paid',
    );
  });

  it('follows the order fee columns otherwise', () => {
    assert.equal(treatmentFeeTransferState({}), 'awaiting_receipt');
    assert.equal(
      treatmentFeeTransferState({ treatmentFeePaymentStatus: 'awaiting_confirmation' }),
      'receipt_sent',
    );
    assert.equal(
      treatmentFeeTransferState({
        treatmentFeePaymentStatus: 'awaiting_confirmation',
        treatmentFeeReviewOpenedAt: OPENED,
      }),
      'to_verify',
    );
    assert.equal(treatmentFeeTransferState({ treatmentFeePaymentStatus: 'rejected' }), 'refused');
  });
});

describe('installmentTransferOf', () => {
  const transfer = {
    paymentId: 'pay_1',
    status: 'awaiting_confirmation',
    state: 'receipt_sent',
    declaredAt: OPENED,
    reviewOpenedAt: null,
    rejectionReason: null,
    hasProof: true,
  };

  it('keeps the in-flight declaration of an open installment', () => {
    const out = installmentTransferOf({ status: 'pending', latestTransfer: transfer });
    assert.equal(out.state, 'receipt_sent');
    assert.equal(out.transfer, transfer);
  });

  it('drops the declaration of a settled or cancelled installment', () => {
    assert.deepEqual(installmentTransferOf({ status: 'paid', latestTransfer: transfer }), {
      state: 'paid',
      transfer: null,
    });
    assert.deepEqual(installmentTransferOf({ status: 'cancelled', latestTransfer: transfer }), {
      state: null,
      transfer: null,
    });
  });

  it('falls back to the installment status when the API omits latestTransfer', () => {
    assert.deepEqual(installmentTransferOf({ status: 'overdue' }), {
      state: 'awaiting_receipt',
      transfer: null,
    });
  });
});

describe('state helpers', () => {
  it('in flight = sent or under review; payable = nothing in flight and not paid', () => {
    assert.deepEqual(
      TRANSFER_STATES.filter(isTransferInFlight),
      ['receipt_sent', 'to_verify'],
    );
    assert.deepEqual(
      TRANSFER_STATES.filter(isTransferPayable),
      ['awaiting_receipt', 'refused'],
    );
    assert.equal(isTransferInFlight(null), false);
    assert.equal(isTransferPayable(undefined), false);
  });

  it('gives every state a tone and a label key per audience', () => {
    for (const state of TRANSFER_STATES) {
      assert.ok(TRANSFER_STATE_TONE[state], state);
      assert.equal(transferStateLabelKey(state), `transfers.state.doctor.${state}`);
      assert.equal(transferStateLabelKey(state, 'admin'), `transfers.state.admin.${state}`);
    }
  });

  it('prints a refusal reason trimmed, or nothing', () => {
    assert.equal(refusalReasonOf('  Montant incorrect  '), 'Montant incorrect');
    assert.equal(refusalReasonOf('   '), null);
    assert.equal(refusalReasonOf(null), null);
    assert.equal(refusalReasonOf(undefined), null);
  });
});
