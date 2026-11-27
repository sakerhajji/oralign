// Run: node --test src/lib/doctor/clinic-payload.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The optional text fields of the clinic forms: typed text is sent
// trimmed, a field the user emptied is sent as null (the server clears
// it), and a field with nothing to change is left out (undefined keeps
// the stored value).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  optionalTextChanged,
  optionalTextPayload,
  optionalTextPayloads,
} from './clinic-payload.ts';

describe('optionalTextPayload', () => {
  it('sends typed text trimmed', () => {
    assert.equal(optionalTextPayload('  12 rue de Carthage ', 'old'), '12 rue de Carthage');
    assert.equal(optionalTextPayload('Sfax', null), 'Sfax');
    assert.equal(optionalTextPayload('Sfax'), 'Sfax');
  });

  it('clears (null) a stored value the user emptied', () => {
    assert.equal(optionalTextPayload('', 'Tunis'), null);
    assert.equal(optionalTextPayload('   ', 'Tunis'), null);
    assert.equal(optionalTextPayload(undefined, 'Tunis'), null);
    assert.equal(optionalTextPayload(null, '1234567/A'), null);
  });

  it('leaves the field out (undefined) when nothing was stored', () => {
    assert.equal(optionalTextPayload('', null), undefined);
    assert.equal(optionalTextPayload('', undefined), undefined);
    assert.equal(optionalTextPayload('  ', ''), undefined);
    assert.equal(optionalTextPayload('', '   '), undefined);
    assert.equal(optionalTextPayload(undefined), undefined);
  });

  it('never sends an empty string (clinicEmail is unique)', () => {
    for (const value of ['', ' ', '\t\n', undefined, null]) {
      for (const stored of ['x@clinic.tn', '', null, undefined]) {
        assert.notEqual(optionalTextPayload(value, stored), '');
      }
    }
  });

  it('treats a non-string as blank', () => {
    assert.equal(optionalTextPayload(42, 'Tunis'), null);
    assert.equal(optionalTextPayload({}, null), undefined);
  });
});

describe('optionalTextPayloads', () => {
  const keys = ['clinicAddress', 'city', 'taxId', 'specialty'];

  it('maps every listed field against the stored record', () => {
    assert.deepEqual(
      optionalTextPayloads(
        keys,
        { clinicAddress: ' 3 av. Habib Bourguiba ', city: '', taxId: '  ', specialty: '' },
        { clinicAddress: 'old', city: 'Tunis', taxId: null, specialty: undefined },
      ),
      { clinicAddress: '3 av. Habib Bourguiba', city: null, taxId: undefined, specialty: undefined },
    );
  });

  it('sends only text for a new profile (no stored record)', () => {
    assert.deepEqual(
      optionalTextPayloads(keys, { clinicAddress: '', city: 'Sousse' }, null),
      { clinicAddress: undefined, city: 'Sousse', taxId: undefined, specialty: undefined },
    );
  });

  it('reads only the listed keys', () => {
    const payload = optionalTextPayloads(['city'], { city: 'Nabeul', clinicName: 'X' }, undefined);
    assert.deepEqual(Object.keys(payload), ['city']);
  });
});

describe('the clinic and account forms clear what the user emptied', () => {
  // /account/settings: the clinic tab used to send undefined for an
  // emptied address or phone, so the server kept the old one and the
  // documents went on printing a stale practice phone (spec 6).
  it('sends null for an emptied stored practice phone or address', () => {
    const stored = { clinicAddress: '12 rue de Carthage', clinicPhone: '+21671000000' };
    assert.equal(optionalTextPayload(undefined, stored.clinicPhone), null);
    assert.equal(optionalTextPayload('', stored.clinicAddress), null);
    // A profile still to create: blanks stay out of the create body.
    assert.equal(optionalTextPayload(undefined, undefined), undefined);
  });

  it('sends null for an emptied account phone or country', () => {
    assert.equal(optionalTextPayload(undefined, '+21698000000'), null);
    assert.equal(optionalTextPayload('', 'TN'), null);
  });
});

describe('optionalTextChanged', () => {
  it('sees a cleared stored value as a change', () => {
    assert.equal(optionalTextChanged(null, '+21698000000'), true);
    assert.equal(optionalTextChanged(null, '  '), false);
    assert.equal(optionalTextChanged(null, null), false);
  });

  it('compares typed text with the stored value', () => {
    assert.equal(optionalTextChanged('+21698000000', '+21698000000'), false);
    assert.equal(optionalTextChanged('+21698000001', '+21698000000'), true);
    assert.equal(optionalTextChanged('TN', null), true);
  });

  it('never counts a field left out', () => {
    assert.equal(optionalTextChanged(undefined, 'TN'), false);
    assert.equal(optionalTextChanged(undefined, null), false);
  });

  it('round-trips with optionalTextPayload', () => {
    for (const [value, stored, changed] of [
      ['', 'TN', true],
      ['', null, false],
      ['TN', 'TN', false],
      [' TN ', 'TN', false],
      ['FR', 'TN', true],
    ]) {
      assert.equal(
        optionalTextChanged(optionalTextPayload(value, stored), stored),
        changed,
        `${JSON.stringify(value)} / ${JSON.stringify(stored)}`,
      );
    }
  });
});
