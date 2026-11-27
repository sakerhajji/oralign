// Run: node --test src/lib/doctor/identity-queries.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// After a profile or clinic save, every cached query showing the doctor's
// live identity is refreshed (spec §6), rendered documents excepted (they
// are snapshots).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOCUMENT_QUERY_SEGMENTS,
  showsDoctorIdentity,
  startsWithRoot,
} from './identity-queries.ts';

const ROOTS = [['orders'], ['patients'], ['payments'], ['admin-invoices', 'clients']];

describe('startsWithRoot', () => {
  it('matches a root that prefixes the key, element by element', () => {
    assert.equal(startsWithRoot(['orders', 'detail', 'o1'], ['orders']), true);
    assert.equal(
      startsWithRoot(['admin-invoices', 'clients', 'amel'], ['admin-invoices', 'clients']),
      true,
    );
  });

  it('never matches a longer root, an empty root or another tree', () => {
    assert.equal(startsWithRoot(['orders'], ['orders', 'detail']), false);
    assert.equal(startsWithRoot(['orders'], []), false);
    assert.equal(startsWithRoot(['orders-archive'], ['orders']), false);
  });
});

describe('showsDoctorIdentity', () => {
  it('refreshes the lists and details that join the doctor live', () => {
    assert.equal(showsDoctorIdentity(['orders', 'list', { page: 1 }], ROOTS), true);
    assert.equal(showsDoctorIdentity(['patients', 'detail', 'p1'], ROOTS), true);
    assert.equal(
      showsDoctorIdentity(['admin-invoices', 'clients', 'amel'], ROOTS),
      true,
    );
  });

  it('leaves the other trees alone (stored invoices are snapshots)', () => {
    assert.equal(showsDoctorIdentity(['admin-invoices', 'list', {}], ROOTS), false);
    assert.equal(showsDoctorIdentity(['notifications', 'list'], ROOTS), false);
  });

  it('skips rendered documents under an identity root', () => {
    assert.ok(DOCUMENT_QUERY_SEGMENTS.includes('invoice-pdf'));
    assert.equal(
      showsDoctorIdentity(['payments', 'detail', 'pay1', 'invoice-pdf', 'fr', null], ROOTS),
      false,
    );
    assert.equal(
      showsDoctorIdentity(['orders', 'detail', 'o1', 'treatment-fee-invoice-pdf', 'fr'], ROOTS),
      false,
    );
    // ... but not the order itself.
    assert.equal(showsDoctorIdentity(['orders', 'detail', 'o1'], ROOTS), true);
  });

  it('only string segments count as document markers', () => {
    assert.equal(
      showsDoctorIdentity(['orders', 'list', { status: 'document' }], ROOTS),
      true,
    );
  });
});
