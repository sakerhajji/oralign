// Run: node --test src/lib/payments/idempotency.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The Idempotency-Key the transfer declarations send must pass the
// server's check (8-128 characters of [A-Za-z0-9_-], CONTRACT §0).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  installmentIdempotencyKey,
  isValidIdempotencyKey,
  newIdempotencyKey,
} from './idempotency.ts';

describe('idempotency keys', () => {
  it('makes keys the server accepts, and never twice the same', () => {
    const keys = new Set();
    for (let i = 0; i < 50; i++) {
      const key = newIdempotencyKey();
      assert.ok(isValidIdempotencyKey(key), key);
      keys.add(key);
    }
    assert.equal(keys.size, 50);
  });

  it('refuses what the server refuses', () => {
    assert.equal(isValidIdempotencyKey('short'), false);
    assert.equal(isValidIdempotencyKey('has space in it'), false);
    assert.equal(isValidIdempotencyKey('x'.repeat(129)), false);
    assert.equal(isValidIdempotencyKey(42), false);
    assert.equal(isValidIdempotencyKey('a'.repeat(8)), true);
  });

  it('derives one stable, valid key per installment of a batch', () => {
    const base = newIdempotencyKey();
    const first = installmentIdempotencyKey(base, 1);
    assert.equal(first, installmentIdempotencyKey(base, 1));
    assert.notEqual(first, installmentIdempotencyKey(base, 2));
    assert.ok(isValidIdempotencyKey(first));
    assert.ok(isValidIdempotencyKey(installmentIdempotencyKey('k'.repeat(128), 12)));
  });
});
