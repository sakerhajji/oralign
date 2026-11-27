// Run: node --test src/lib/payments/payment-refusals.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// A refused payment (not a receipt upload) is explained by the API's
// stable errorCode, never by its French message: the retenue refusals,
// and « another payment is open » worded for the admin or the doctor.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inFlightPaymentOf,
  inFlightRefusalKey,
  isPaymentAttemptInProgress,
  thresholdOfBody,
  withholdingRefusalText,
} from './payment-refusals.ts';

// A translator that shows the key and its variables.
const t = (key, vars) => (vars ? `${key}|${JSON.stringify(vars)}` : key);
const money = (value) => `${value.toFixed(3)} TND`;

describe('withholdingRefusalText', () => {
  it('words a retenue switched off', () => {
    assert.equal(
      withholdingRefusalText('WITHHOLDING_DISABLED', {}, t, money),
      'withholdingRules.errors.disabled',
    );
  });

  it('names the threshold the body carries', () => {
    assert.equal(
      withholdingRefusalText('WITHHOLDING_BELOW_THRESHOLD', { withholdingThreshold: 1000 }, t, money),
      'withholdingRules.errors.belowThreshold|{"threshold":"1000.000 TND"}',
    );
    // A decimal string (Prisma Decimal) reads the same.
    assert.equal(
      withholdingRefusalText('WITHHOLDING_BELOW_THRESHOLD', { withholdingThreshold: '1000.000' }, t, money),
      'withholdingRules.errors.belowThreshold|{"threshold":"1000.000 TND"}',
    );
  });

  it('falls back to the copy without an amount', () => {
    for (const body of [null, undefined, {}, { withholdingThreshold: 'abc' }, 'text']) {
      assert.equal(
        withholdingRefusalText('WITHHOLDING_BELOW_THRESHOLD', body, t, money),
        'withholdingRules.errors.belowThresholdNoAmount',
      );
    }
  });

  it('leaves every other error to its own message', () => {
    for (const code of [null, undefined, 'WITHHOLDING_CHOICE_CONFLICT', 'PAYMENT_ATTEMPT_IN_PROGRESS']) {
      assert.equal(withholdingRefusalText(code, {}, t, money), null);
    }
  });
});

describe('thresholdOfBody', () => {
  it('reads a finite number or numeric string only', () => {
    assert.equal(thresholdOfBody({ withholdingThreshold: 250.5 }), 250.5);
    assert.equal(thresholdOfBody({ withholdingThreshold: ' 12 ' }), 12);
    assert.equal(thresholdOfBody({ withholdingThreshold: Number.NaN }), null);
    assert.equal(thresholdOfBody({ withholdingThreshold: '' }), null);
    assert.equal(thresholdOfBody(null), null);
  });
});

describe('inFlightPaymentOf', () => {
  it('reads a refused card start as a transfer awaiting the admin', () => {
    // The API refuses a card only for another KIND in flight: a transfer.
    for (const awaiting of [true, false, null]) {
      assert.equal(inFlightPaymentOf('card', awaiting), 'transfer');
    }
  });

  it('tells a transfer from a card attempt for cash and cheques', () => {
    for (const method of ['cash', 'cheque']) {
      assert.equal(inFlightPaymentOf(method, true), 'transfer');
      assert.equal(inFlightPaymentOf(method, false), 'card');
      assert.equal(inFlightPaymentOf(method, null), 'unknown');
    }
  });
});

describe('inFlightRefusalKey', () => {
  it('words it for the admin or the doctor', () => {
    assert.equal(inFlightRefusalKey('admin', 'transfer'), 'transfers.inFlight.admin.transfer');
    assert.equal(inFlightRefusalKey('doctor', 'transfer'), 'transfers.inFlight.doctor.transfer');
    assert.equal(inFlightRefusalKey('admin', 'card'), 'transfers.inFlight.admin.card');
    assert.equal(inFlightRefusalKey('doctor', 'card'), 'transfers.inFlight.doctor.card');
  });

  it('has one neutral copy when the data cannot tell', () => {
    assert.equal(inFlightRefusalKey('admin', 'unknown'), 'transfers.inFlight.unknown');
    assert.equal(inFlightRefusalKey('doctor', 'unknown'), 'transfers.inFlight.unknown');
  });
});

describe('isPaymentAttemptInProgress', () => {
  it('matches the code only', () => {
    assert.equal(isPaymentAttemptInProgress('PAYMENT_ATTEMPT_IN_PROGRESS'), true);
    assert.equal(isPaymentAttemptInProgress('WITHHOLDING_CHOICE_CONFLICT'), false);
    assert.equal(isPaymentAttemptInProgress(null), false);
  });
});
