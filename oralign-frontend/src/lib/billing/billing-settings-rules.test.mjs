// Run: node --test src/lib/billing/billing-settings-rules.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The billing settings form's parsing (mirrors the backend DTO limits) and
// its rules fields (the fiscal and rollout settings the server journals).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BILLING_RULE_FIELDS,
  billingRuleChanges,
  billingRuleKind,
  inactivityRuleChanged,
  isActivation,
  isBillingRuleField,
  parseAmount,
  parseInactivityMonths,
  parseNextNumber,
  parseRate,
  parseWithholdingRate,
  readRuleValue,
} from './billing-settings-rules.ts';

describe('parsing', () => {
  it('reads amounts with up to 3 decimals, comma or point', () => {
    assert.equal(parseAmount('1000'), 1000);
    assert.equal(parseAmount(' 1000,5 '), 1000.5);
    assert.equal(parseAmount('0.001'), 0.001);
    assert.equal(parseAmount('1000.0001'), null);
    assert.equal(parseAmount('-1'), null);
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('1e3'), null);
    assert.equal(parseAmount('1000000000'), null);
  });

  it('bounds the TVA rate to 100 and the retenue rate to 99.99 (2 decimals)', () => {
    assert.equal(parseRate('19'), 19);
    assert.equal(parseRate('100.5'), null);
    assert.equal(parseWithholdingRate('1,5'), 1.5);
    assert.equal(parseWithholdingRate('99.99'), 99.99);
    assert.equal(parseWithholdingRate('100'), null);
    assert.equal(parseWithholdingRate('1.555'), null);
  });

  it('reads the inactivity period as whole months from 1 to 24', () => {
    assert.equal(parseInactivityMonths('6'), 6);
    assert.equal(parseInactivityMonths(' 24 '), 24);
    assert.equal(parseInactivityMonths('0'), null);
    assert.equal(parseInactivityMonths('25'), null);
    assert.equal(parseInactivityMonths('6.5'), null);
    assert.equal(parseInactivityMonths(''), null);
  });

  it('reads the next quote number as a whole number of 1 or more', () => {
    assert.equal(parseNextNumber('12'), 12);
    assert.equal(parseNextNumber('0'), null);
    assert.equal(parseNextNumber('1.5'), null);
  });
});

describe('billingRuleChanges', () => {
  const saved = {
    withholdingEnabled: false,
    withholdingRate: 1,
    withholdingThreshold: 1000,
    stampDuty: 1,
    defaultTvaRate: 19,
    inactivityRuleEnabled: false,
    inactivityMonths: 6,
  };

  it('lists the moved fields in display order', () => {
    const changes = billingRuleChanges(saved, {
      ...saved,
      inactivityMonths: 12,
      withholdingEnabled: true,
      withholdingThreshold: 1500,
    });
    assert.deepEqual(changes, [
      { field: 'withholdingEnabled', before: false, after: true },
      { field: 'withholdingThreshold', before: 1000, after: 1500 },
      { field: 'inactivityMonths', before: 6, after: 12 },
    ]);
  });

  it('compares amounts in millimes (no float noise)', () => {
    assert.deepEqual(billingRuleChanges({ ...saved, stampDuty: 0.1 + 0.2 }, { ...saved, stampDuty: 0.3 }), []);
    assert.equal(billingRuleChanges(saved, { ...saved, stampDuty: 1.001 }).length, 1);
  });

  it('treats a field the saved row lacks as a change from null', () => {
    const older = { ...saved };
    delete older.withholdingEnabled;
    assert.deepEqual(billingRuleChanges(older, saved), [
      { field: 'withholdingEnabled', before: null, after: false },
    ]);
  });

  it('has nothing to confirm before the settings exist', () => {
    assert.deepEqual(billingRuleChanges(null, saved), []);
  });

  it('tells a switch turned on', () => {
    assert.equal(isActivation({ field: 'withholdingEnabled', before: false, after: true }), true);
    assert.equal(isActivation({ field: 'inactivityRuleEnabled', before: null, after: true }), true);
    assert.equal(isActivation({ field: 'withholdingEnabled', before: true, after: false }), false);
    assert.equal(isActivation({ field: 'inactivityMonths', before: 6, after: 12 }), false);
  });
});

describe('rules values', () => {
  it('knows every journaled field and how it reads', () => {
    assert.equal(BILLING_RULE_FIELDS.length, 7);
    assert.equal(billingRuleKind('withholdingThreshold'), 'amount');
    assert.equal(billingRuleKind('withholdingRate'), 'percent');
    assert.equal(billingRuleKind('inactivityMonths'), 'months');
    assert.equal(billingRuleKind('inactivityRuleEnabled'), 'switch');
    assert.equal(isBillingRuleField('stampDuty'), true);
    assert.equal(isBillingRuleField('companyName'), false);
  });

  it('reads the journal values the API returns', () => {
    assert.equal(readRuleValue('1000.000'), 1000);
    assert.equal(readRuleValue('1.50'), 1.5);
    assert.equal(readRuleValue(6), 6);
    assert.equal(readRuleValue(true), true);
    assert.equal(readRuleValue(null), null);
    assert.equal(readRuleValue(''), null);
    assert.equal(readRuleValue('abc'), null);
    assert.equal(readRuleValue({}), null);
  });
});

describe('inactivityRuleChanged', () => {
  const rule = (inactivityRuleEnabled, inactivityMonths) => ({
    inactivityRuleEnabled,
    inactivityMonths,
  });

  it('sees the switch or the period moving', () => {
    assert.equal(inactivityRuleChanged(rule(false, 6), rule(true, 6)), true);
    assert.equal(inactivityRuleChanged(rule(true, 6), rule(true, 3)), true);
    assert.equal(inactivityRuleChanged(rule(true, 6), rule(false, 6)), true);
  });

  it('ignores a save that leaves the rule as it was', () => {
    // A retenue or stamp change must not refetch the users desk.
    assert.equal(inactivityRuleChanged(rule(true, 6), rule(true, 6)), false);
    assert.equal(inactivityRuleChanged(rule(undefined, 6), rule(false, 6)), false);
  });

  it('counts unknown previous settings as a change', () => {
    assert.equal(inactivityRuleChanged(null, rule(false, 6)), true);
    assert.equal(inactivityRuleChanged(undefined, rule(false, 6)), true);
  });
});
