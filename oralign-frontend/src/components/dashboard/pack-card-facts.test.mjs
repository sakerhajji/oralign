// Run: node --test src/components/dashboard/pack-card-facts.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The practitioner pack catalogue (spec §7): validity = the admin's label,
// the coverage months as the fallback, hidden when neither is set;
// corrections stay the numeric value; names and descriptions localized.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  packCardDescription,
  packCardFacts,
  packCardName,
  packCorrectionsFact,
  packStepsFact,
  packValidityFact,
} from './pack-card-facts.ts';

// Same rule as pickLocalized (lib/api/blog.service.ts): the UI language,
// then French, then English; a bare string is returned as it is.
const pickFor = (lang) => (value) => {
  if (value == null) return '';
  if (typeof value !== 'object') return value;
  return value[lang === 'en' ? 'en' : 'fr'] ?? value.fr ?? value.en ?? '';
};
const fr = pickFor('fr');
const en = pickFor('en');

describe('packCardName / packCardDescription', () => {
  const pack = {
    name: 'Forfait Confort',
    description: 'Traitement complet',
    nameI18n: { fr: 'Forfait Confort', en: 'Comfort pack' },
    descriptionI18n: { fr: 'Traitement complet', en: 'Full treatment' },
  };

  it('uses the UI language', () => {
    assert.equal(packCardName(pack, en), 'Comfort pack');
    assert.equal(packCardName(pack, fr), 'Forfait Confort');
    assert.equal(packCardDescription(pack, en), 'Full treatment');
  });

  it('falls back to French when the English text is missing', () => {
    const frOnly = { ...pack, nameI18n: { fr: 'Forfait Confort' }, descriptionI18n: { fr: 'Complet' } };
    assert.equal(packCardName(frOnly, en), 'Forfait Confort');
    assert.equal(packCardDescription(frOnly, en), 'Complet');
  });

  it('reads legacy packs without bags through the plain columns', () => {
    const legacy = { name: 'Express', description: ' Court ', nameI18n: null, descriptionI18n: null };
    assert.equal(packCardName(legacy, en), 'Express');
    assert.equal(packCardDescription(legacy, en), 'Court');
  });

  it('never returns an empty name, and null for a blank description', () => {
    const blank = { name: 'Express', description: '   ', nameI18n: { fr: '  ' }, descriptionI18n: null };
    assert.equal(packCardName(blank, fr), 'Express');
    assert.equal(packCardDescription(blank, fr), null);
    assert.equal(packCardDescription({ name: 'Express' }, fr), null);
  });
});

describe('packValidityFact', () => {
  it('shows the label first, in the UI language', () => {
    const pack = { treatmentExpirationLabel: { fr: '2 ans', en: '2 years' }, treatmentValidityMonths: 18 };
    assert.deepEqual(packValidityFact(pack, en), {
      kind: 'validity',
      key: 'dashboard.packs.featureValidity',
      params: { period: '2 years' },
    });
    assert.deepEqual(packValidityFact(pack, fr).params, { period: '2 ans' });
  });

  it('never parses the label: free text is shown as written, trimmed', () => {
    const pack = { treatmentExpirationLabel: { fr: '  jusqu’à 36 mois ' } };
    assert.deepEqual(packValidityFact(pack, fr).params, { period: 'jusqu’à 36 mois' });
  });

  it('falls back to the months when no label is set (seeded packs have labels only)', () => {
    assert.deepEqual(packValidityFact({ treatmentExpirationLabel: null, treatmentValidityMonths: 24 }, fr), {
      kind: 'validity',
      key: 'dashboard.packs.featureValidityMonths',
      params: { count: 24 },
    });
    assert.equal(
      packValidityFact({ treatmentExpirationLabel: { fr: ' ' }, treatmentValidityMonths: 1 }, fr).key,
      'dashboard.packs.featureValidityMonth',
    );
  });

  it('is hidden when neither is usable', () => {
    assert.equal(packValidityFact({}, fr), null);
    assert.equal(packValidityFact({ treatmentExpirationLabel: {}, treatmentValidityMonths: null }, fr), null);
    assert.equal(packValidityFact({ treatmentValidityMonths: 0 }, fr), null);
    assert.equal(packValidityFact({ treatmentValidityMonths: -3 }, fr), null);
    assert.equal(packValidityFact({ treatmentValidityMonths: 2.5 }, fr), null);
  });
});

describe('packStepsFact', () => {
  it('reads unlimited first, then the count with a singular form', () => {
    assert.deepEqual(packStepsFact({ isUnlimitedSteps: true, maxStepsPerArch: null }), {
      kind: 'steps',
      key: 'dashboard.packs.featureUnlimitedSteps',
    });
    assert.deepEqual(packStepsFact({ isUnlimitedSteps: false, maxStepsPerArch: 30 }), {
      kind: 'steps',
      key: 'dashboard.packs.featureStepsPerArch',
      params: { count: 30 },
    });
    assert.equal(packStepsFact({ maxStepsPerArch: 1 }).key, 'dashboard.packs.featureStepPerArch');
  });

  it('shows nothing rather than "0 steps" when no number is set', () => {
    assert.equal(packStepsFact({ isUnlimitedSteps: false, maxStepsPerArch: null }), null);
    assert.equal(packStepsFact({ maxStepsPerArch: 0 }), null);
  });
});

describe('packCorrectionsFact', () => {
  it('keeps the numeric value, with unlimited, none, one and many', () => {
    assert.equal(packCorrectionsFact({ isUnlimitedCorrections: true }).key, 'dashboard.packs.featureUnlimitedCorrections');
    assert.deepEqual(packCorrectionsFact({ includedCorrections: 0 }), {
      kind: 'corrections',
      key: 'dashboard.packs.featureNoCorrection',
    });
    assert.equal(packCorrectionsFact({ includedCorrections: 1 }).key, 'dashboard.packs.featureIncludedCorrection');
    assert.deepEqual(packCorrectionsFact({ includedCorrections: 2 }).params, { count: 2 });
  });

  it('shows nothing when the count is unknown', () => {
    assert.equal(packCorrectionsFact({ includedCorrections: null }), null);
    assert.equal(packCorrectionsFact({}), null);
  });
});

describe('packCardFacts', () => {
  it('lists steps, corrections then validity', () => {
    const facts = packCardFacts(
      {
        isUnlimitedSteps: false,
        maxStepsPerArch: 30,
        isUnlimitedCorrections: false,
        includedCorrections: 2,
        treatmentExpirationLabel: { fr: '2 ans' },
        treatmentValidityMonths: null,
      },
      fr,
    );
    assert.deepEqual(
      facts.map((fact) => fact.kind),
      ['steps', 'corrections', 'validity'],
    );
  });

  it('drops the facts a pack does not define', () => {
    const facts = packCardFacts({ isUnlimitedSteps: true, includedCorrections: null }, fr);
    assert.deepEqual(facts, [{ kind: 'steps', key: 'dashboard.packs.featureUnlimitedSteps' }]);
  });
});
