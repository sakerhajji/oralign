// Run: node --test src/lib/doctor/registration-number.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The optional, private professional-order registration number of the
// three clinic forms (spec §6). Mirrors the backend DTO: trimmed, at most
// 64 characters, a blank value clears it (null), never undefined.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REGISTRATION_NUMBER_MAX_LENGTH,
  registrationNumberFits,
  registrationNumberInput,
  registrationNumberPayload,
} from './registration-number.ts';

describe('registrationNumberPayload', () => {
  it('sends the trimmed number', () => {
    assert.equal(registrationNumberPayload('  CNOMDT-12345 '), 'CNOMDT-12345');
  });

  it('sends null for a blank field, so the server clears the stored number', () => {
    assert.equal(registrationNumberPayload(''), null);
    assert.equal(registrationNumberPayload('   '), null);
    assert.equal(registrationNumberPayload(undefined), null);
    assert.equal(registrationNumberPayload(null), null);
  });
});

describe('registrationNumberFits', () => {
  it('accepts an empty field and anything up to the server bound once trimmed', () => {
    assert.equal(registrationNumberFits(''), true);
    assert.equal(registrationNumberFits(undefined), true);
    assert.equal(registrationNumberFits('X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH)), true);
    assert.equal(
      registrationNumberFits(` ${'X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH)} `),
      true,
    );
  });

  it('refuses one character more than the server accepts', () => {
    assert.equal(REGISTRATION_NUMBER_MAX_LENGTH, 64);
    assert.equal(
      registrationNumberFits('X'.repeat(REGISTRATION_NUMBER_MAX_LENGTH + 1)),
      false,
    );
  });
});

describe('registrationNumberInput', () => {
  it('fills the input with the stored number, or an empty string', () => {
    assert.equal(registrationNumberInput('CNOMDT-12345'), 'CNOMDT-12345');
    assert.equal(registrationNumberInput(null), '');
    assert.equal(registrationNumberInput(undefined), '');
  });
});
