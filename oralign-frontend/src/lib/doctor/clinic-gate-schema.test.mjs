// Run: node --test src/lib/doctor/clinic-gate-schema.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The settings forms refuse to empty a clinic field the onboarding gate
// requires (use-onboarding.ts clinicComplete): a cleared address or
// practice phone would send the doctor back to /onboarding/clinic.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gateRequiredPhone, gateRequiredText } from './clinic-gate-schema.ts';

const MSG = 'L’adresse du cabinet est obligatoire';

describe('gateRequiredText', () => {
  it('refuses a blank, an all-space value and a missing value, with the given copy', () => {
    for (const value of ['', '   ', undefined]) {
      const r = gateRequiredText(MSG, 2).safeParse(value);
      assert.equal(r.success, false, JSON.stringify(value));
      assert.equal(r.error.issues[0].message, MSG);
    }
  });

  it('keeps a real value, trimmed', () => {
    assert.equal(gateRequiredText(MSG, 2).parse('  12 rue de Carthage '), '12 rue de Carthage');
    assert.equal(gateRequiredText(MSG).parse('Tunis'), 'Tunis');
  });

  it('applies the minimum length (address: 2)', () => {
    assert.equal(gateRequiredText(MSG, 2).safeParse('a').success, false);
    assert.equal(gateRequiredText(MSG).safeParse('a').success, true);
  });
});

describe('gateRequiredPhone', () => {
  const phone = gateRequiredPhone('format international');
  it('refuses a blank or a local number', () => {
    for (const value of ['', '  ', undefined, '71000777', '+0123456789']) {
      assert.equal(phone.safeParse(value).success, false, JSON.stringify(value));
    }
  });

  it('accepts an international number (trimmed)', () => {
    assert.equal(phone.parse(' +21671000777 '), '+21671000777');
  });
});
