// Run: node --test src/lib/payments/receipt-errors.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// A failed receipt upload is explained by the API's stable errorCode
// (CONTRACT §3), never by its French message, and says whether a retry or
// a refetch is the way out.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receiptRefusalError, receiptUploadError } from './receipt-errors.ts';

const err = (errorCode, status = 400, kind = 'validation') => ({ errorCode, status, kind });

describe('receiptUploadError', () => {
  it('maps the receipt codes to their own copy, without a blind retry', () => {
    for (const [code, kind] of [
      ['RECEIPT_TYPE', 'type'],
      ['RECEIPT_TOO_LARGE', 'too_large'],
      ['PROOF_REQUIRED', 'proof_required'],
    ]) {
      const out = receiptUploadError(err(code));
      assert.equal(out.kind, kind, code);
      assert.equal(out.messageKey, `transfers.errors.${kind}`);
      assert.equal(out.retryable, false, code);
    }
  });

  it('asks for a refetch when the transfer moved on the server', () => {
    for (const code of [
      'PAYMENT_ATTEMPT_IN_PROGRESS',
      'TRANSFER_NOT_WITHDRAWABLE',
      'TRANSFER_ALREADY_PROCESSED',
      'WITHHOLDING_BELOW_THRESHOLD',
      'WITHHOLDING_DISABLED',
      'WELCOME_GIFT_NOTHING_DUE',
    ]) {
      assert.equal(receiptUploadError(err(code, 409, 'conflict')).refetch, true, code);
    }
  });

  it('retries a refused key with a new one', () => {
    const out = receiptUploadError(err('TRANSFER_IDEMPOTENCY_KEY_REUSED', 409, 'conflict'));
    assert.equal(out.retryable, true);
    assert.equal(out.newKey, true);
  });

  it('lets the connection errors be retried as they are', () => {
    for (const kind of ['offline', 'network', 'upstream']) {
      const out = receiptUploadError({ status: null, errorCode: null, kind });
      assert.equal(out.kind, 'network');
      assert.equal(out.retryable, true);
      assert.equal(out.newKey, false);
    }
    const timeout = receiptUploadError({ status: null, errorCode: null, kind: 'timeout' });
    assert.equal(timeout.kind, 'timeout');
    assert.equal(timeout.retryable, true);
    assert.equal(timeout.refetch, true);
  });

  it('reads an nginx 413 as too large', () => {
    assert.equal(
      receiptUploadError({ status: 413, errorCode: null, kind: 'payload_too_large' }).kind,
      'too_large',
    );
  });

  it('falls back to a generic error, retryable only on a 5xx', () => {
    assert.equal(receiptUploadError(err(null, 500, 'server')).retryable, true);
    const bad = receiptUploadError(err('SOMETHING_ELSE', 400, 'validation'));
    assert.equal(bad.kind, 'server');
    assert.equal(bad.retryable, false);
  });
});

describe('receiptRefusalError', () => {
  it('explains a file refused before the upload', () => {
    assert.equal(receiptRefusalError('heic_unsupported').messageKey, 'transfers.errors.heic_unsupported');
    assert.equal(receiptRefusalError('too_large').retryable, false);
  });

  it('names « Prendre une photo » only where the button is shown', () => {
    // A coarse pointer shows the camera button: the advice may name it.
    assert.equal(
      receiptRefusalError('heic_unsupported', { camera: true }).messageKey,
      'transfers.errors.heic_unsupported',
    );
    // A mouse (an iPhone photo synced to a PC): no camera button on screen.
    const desktop = receiptRefusalError('heic_unsupported', { camera: false });
    assert.equal(desktop.kind, 'heic_unsupported');
    assert.equal(desktop.messageKey, 'transfers.errors.heic_unsupported_desktop');
    // Other refusals read the same everywhere.
    assert.equal(
      receiptRefusalError('type', { camera: false }).messageKey,
      'transfers.errors.type',
    );
  });
});

describe('a receipt replaced after the transfer was processed', () => {
  it('reads « déjà traité » and refetches, whichever code the server sends', () => {
    for (const code of [
      'INSTALLMENT_ALREADY_PAID',
      'TRANSFER_ALREADY_PROCESSED',
      'TRANSFER_NOT_WITHDRAWABLE',
    ]) {
      const out = receiptUploadError(err(code, 409, 'conflict'));
      assert.ok(['already_processed', 'not_withdrawable'].includes(out.kind), code);
      assert.equal(out.refetch, true, code);
      assert.equal(out.retryable, false, code);
    }
    assert.equal(receiptUploadError(err('INSTALLMENT_ALREADY_PAID', 409, 'conflict')).kind, 'already_processed');
  });
});
