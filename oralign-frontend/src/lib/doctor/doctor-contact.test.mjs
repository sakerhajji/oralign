// Run: node --test src/lib/doctor/doctor-contact.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// Spec §6: the order screens show the same doctor contact as the devis
// and the invoices (practice first, account as fallback), read from the
// shared doctor summary.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { doctorContactEmail, doctorWithTitle } from './doctor-contact.ts';

describe('doctorWithTitle', () => {
  it('adds « Dr. » to a bare name', () => {
    assert.equal(doctorWithTitle('Saker Hajji'), 'Dr. Saker Hajji');
    assert.equal(doctorWithTitle('  Saker Hajji '), 'Dr. Saker Hajji');
  });

  it('never doubles a title already in the name (sign-up stores « Dr. … »)', () => {
    assert.equal(doctorWithTitle('Dr. Saker Hajji'), 'Dr. Saker Hajji');
    assert.equal(doctorWithTitle('Dr Saker Hajji'), 'Dr Saker Hajji');
    assert.equal(doctorWithTitle('dr. saker hajji'), 'dr. saker hajji');
    assert.equal(doctorWithTitle('Docteur Hajji'), 'Docteur Hajji');
  });

  it('titles a name that only starts with the letters', () => {
    assert.equal(doctorWithTitle('Driss Ben Ali'), 'Dr. Driss Ben Ali');
    assert.equal(doctorWithTitle('Dra Amel'), 'Dr. Dra Amel');
  });

  it('is null without a name', () => {
    assert.equal(doctorWithTitle(null), null);
    assert.equal(doctorWithTitle(undefined), null);
    assert.equal(doctorWithTitle('   '), null);
  });
});

describe('doctorContactEmail', () => {
  it('shows the practice contact of the summary first', () => {
    assert.equal(
      doctorContactEmail({ email: 'dr.x@gmail.com', contactEmail: 'contact@cabinet-x.tn' }),
      'contact@cabinet-x.tn',
    );
  });

  it('falls back to the account e-mail', () => {
    // The summary already falls back server-side; a payload without it
    // (a designer's view, an older response) keeps the account e-mail.
    assert.equal(doctorContactEmail({ email: 'dr.x@gmail.com', contactEmail: null }), 'dr.x@gmail.com');
    assert.equal(doctorContactEmail({ email: 'dr.x@gmail.com' }), 'dr.x@gmail.com');
    assert.equal(doctorContactEmail({ email: 'dr.x@gmail.com', contactEmail: '  ' }), 'dr.x@gmail.com');
  });

  it('is null without a doctor or an e-mail', () => {
    assert.equal(doctorContactEmail(null), null);
    assert.equal(doctorContactEmail(undefined), null);
    assert.equal(doctorContactEmail({}), null);
  });
});
