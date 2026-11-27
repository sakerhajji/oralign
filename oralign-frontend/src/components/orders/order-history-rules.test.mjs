// Run: node --test src/components/orders/order-history-rules.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// How the History tab reads the rows the transfer flows and the batch
// unlocks journal since 2026-11-27 (CONTRACT §5), next to the entries the
// server still derives from Payment rows and batches.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NOTE_REASON_ACTIONS,
  actionKeyOf,
  amountOf,
  displaySource,
  distinctCash,
  textOf,
} from './order-history-rules.ts';

const entry = (action, source = 'order', metadata = null) => ({ action, source, metadata });

describe('displaySource', () => {
  it('files journaled transfer rows under « Paiement »', () => {
    for (const action of [
      'payment_transfer_declared',
      'payment_proof_replaced',
      'payment_transfer_withdrawn',
      'payment_review_opened',
      'payment_confirmed',
      'payment_rejected',
      'treatment_fee_proof_uploaded',
      'treatment_fee_proof_replaced',
      'treatment_fee_proof_removed',
      'treatment_fee_review_opened',
      'treatment_fee_rejected',
      'treatment_fee_confirmed',
    ]) {
      assert.equal(displaySource(entry(action)), 'payment', action);
    }
  });

  it('files a journaled unlock with the derived batch entries', () => {
    assert.equal(displaySource(entry('batch_unlocked')), 'delivery');
  });

  it('keeps every other row, and the source the server gave', () => {
    assert.equal(displaySource(entry('submitted')), 'order');
    assert.equal(displaySource(entry('files_uploaded')), 'order');
    assert.equal(displaySource(entry('payment_started', 'payment')), 'payment');
    assert.equal(displaySource(entry('quotation_sent', 'quotation')), 'quotation');
    assert.equal(displaySource(entry('batch_unlocked', 'delivery')), 'delivery');
  });
});

describe('actionKeyOf', () => {
  it('refines a journaled unlock by what released it', () => {
    assert.equal(
      actionKeyOf(entry('batch_unlocked', 'order', { source: 'manual' })),
      'batch_unlocked_manual',
    );
    assert.equal(
      actionKeyOf(entry('batch_unlocked', 'order', { source: 'payment' })),
      'batch_unlocked_payment',
    );
    assert.equal(
      actionKeyOf(entry('batch_unlocked', 'order', { source: 'installment_cancelled' })),
      'batch_unlocked_installment_cancelled',
    );
  });

  it('keeps the plain key of a derived unlock and of every other action', () => {
    assert.equal(actionKeyOf(entry('batch_unlocked', 'delivery', { batchNumber: 2 })), 'batch_unlocked');
    assert.equal(actionKeyOf(entry('batch_unlocked', 'order', null)), 'batch_unlocked');
    assert.equal(actionKeyOf(entry('batch_unlocked', 'order', { source: '' })), 'batch_unlocked');
    assert.equal(actionKeyOf(entry('batch_unlocked', 'order', { source: 'x.y' })), 'batch_unlocked');
    assert.equal(actionKeyOf(entry('payment_confirmed', 'order', { source: 'manual' })), 'payment_confirmed');
  });
});

describe('NOTE_REASON_ACTIONS', () => {
  it('reads a withdrawal note and a manual unlock reason as notes, a refusal as a refusal', () => {
    assert.ok(NOTE_REASON_ACTIONS.has('payment_transfer_withdrawn'));
    assert.ok(NOTE_REASON_ACTIONS.has('treatment_fee_proof_removed'));
    assert.ok(NOTE_REASON_ACTIONS.has('batch_unlocked'));
    assert.ok(!NOTE_REASON_ACTIONS.has('payment_rejected'));
    assert.ok(!NOTE_REASON_ACTIONS.has('treatment_fee_rejected'));
  });
});

describe('textOf / amountOf', () => {
  it('trims text and drops blanks and non-strings', () => {
    assert.equal(textOf('  Montant incorrect  '), 'Montant incorrect');
    assert.equal(textOf('   '), null);
    assert.equal(textOf(42), null);
    assert.equal(textOf(undefined), null);
  });

  it('reads JSON numbers and decimal strings', () => {
    assert.equal(amountOf(793), 793);
    assert.equal(amountOf('793.000'), 793);
    assert.equal(amountOf(''), null);
    assert.equal(amountOf('abc'), null);
    assert.equal(amountOf(Number.NaN), null);
    assert.equal(amountOf(null), null);
  });
});

describe('distinctCash', () => {
  it('shows the cash only when it differs from the amount', () => {
    assert.equal(distinctCash({ amount: 1000, cashAmount: 991 }), 991);
    assert.equal(distinctCash({ amount: 1000, cashAmount: 1000 }), null);
    assert.equal(distinctCash({ amount: '1000.000', cashAmount: 1000 }), null);
    assert.equal(distinctCash({ amount: 1000 }), null);
    assert.equal(distinctCash({ cashAmount: 991 }), 991);
  });
});
