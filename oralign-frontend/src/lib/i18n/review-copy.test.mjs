// Run: node --test src/lib/i18n/review-copy.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported modules.)
//
// The copy the review fixes of 2026-11-27 rely on exists in both app
// languages (the app dictionary is FR / EN only) and says the right thing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commerceDomainDict } from './dict.commerce-domain.ts';
import { paymentsDeskDomainDict } from './dict.payments-desk-domain.ts';
import { transfersDomainDict } from './dict.transfers-domain.ts';

const bothLanguages = (leaf, name) => {
  assert.ok(leaf, `${name} is missing`);
  assert.deepEqual(Object.keys(leaf).sort(), ['en', 'fr'], name);
  assert.ok(leaf.fr.trim() && leaf.en.trim(), name);
};

describe('review copy', () => {
  it('words a ?review= transfer absent from another tab without claiming its state', () => {
    const gone = paymentsDeskDomainDict.pendingDesk.gone;
    bothLanguages(gone.notInTabTitle, 'pendingDesk.gone.notInTabTitle');
    bothLanguages(gone.notInTabBody, 'pendingDesk.gone.notInTabBody');
    assert.doesNotMatch(gone.notInTabTitle.fr, /plus en attente/);
    assert.doesNotMatch(gone.notInTabTitle.en, /no longer/);
  });

  it('gives a mouse user HEIC advice without « Prendre une photo »', () => {
    const leaf = transfersDomainDict.transfers.errors.heic_unsupported_desktop;
    bothLanguages(leaf, 'transfers.errors.heic_unsupported_desktop');
    assert.doesNotMatch(leaf.fr, /Prendre une photo/);
    assert.doesNotMatch(leaf.en, /Take a photo/);
  });

  it('explains a manually released tranche on a pack change or a re-plan', () => {
    const leaf = commerceDomainDict.quoteEditor.errors.QUOTE_PLAN_BATCH_RELEASED;
    bothLanguages(leaf, 'quoteEditor.errors.QUOTE_PLAN_BATCH_RELEASED');
    assert.match(leaf.fr, /forfait/);
    assert.match(leaf.fr, /échéancier/);
  });
});
