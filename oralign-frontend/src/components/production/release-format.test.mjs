// Run: node --test src/components/production/release-format.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The release block as the lab reads it (spec §3): « Plan 1→7 ·
// Débloquées 1→4 · Prochaine tranche 5→7 », counters against the
// released steps, and a form that never proposes a locked step.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canOfferBatchUnlock,
  everythingReleased,
  lockedParts,
  mergeSpans,
  nothingReleased,
  plannedTotalLabel,
  releaseLines,
  releasedStepTo,
  spanLabel,
  spanStepCount,
  uncoveredSpans,
  unlockedByAnotherAct,
  workableCounterText,
  workableStepCount,
} from './release-format.ts';

const arch = (total, unlocked, provisional = false) => ({
  total: total === null ? null : { from: 1, to: total },
  provisional,
  unlocked,
  workableTo: unlocked.length ? unlocked[unlocked.length - 1].to : null,
});

// The spec example: plan 1→7, tranche 1→4 released, 5→7 locked.
const partial = {
  state: 'partial',
  arches: { upper: arch(7, [{ from: 1, to: 4 }]), lower: arch(7, [{ from: 1, to: 4 }]) },
  next: { from: 5, to: 7 },
};
const none = {
  state: 'none',
  arches: { upper: arch(7, []), lower: null },
  next: { from: 1, to: 4 },
};
const all = {
  state: 'all',
  arches: { upper: arch(7, [{ from: 1, to: 7 }]), lower: null },
  next: null,
};

describe('states', () => {
  it('tells everything / nothing apart', () => {
    assert.equal(everythingReleased(all), true);
    assert.equal(everythingReleased({ state: 'unscheduled' }), true);
    assert.equal(everythingReleased(partial), false);
    assert.equal(nothingReleased(none), true);
    assert.equal(nothingReleased(partial), false);
  });
});

describe('spans', () => {
  it('labels a span with an arrow, a single step alone', () => {
    assert.equal(spanLabel({ from: 1, to: 4 }), '1→4');
    assert.equal(spanLabel({ from: 5, to: 5 }), '5');
  });

  it('counts, merges and finds the gaps', () => {
    assert.equal(spanStepCount([{ from: 1, to: 4 }, { from: 9, to: 12 }]), 8);
    assert.deepEqual(mergeSpans([{ from: 5, to: 7 }, { from: 1, to: 4 }]), [{ from: 1, to: 7 }]);
    assert.deepEqual(uncoveredSpans({ from: 1, to: 10 }, [{ from: 3, to: 4 }]), [
      { from: 1, to: 2 },
      { from: 5, to: 10 },
    ]);
  });
});

describe('releaseLines', () => {
  it('one line when both arches read the same', () => {
    assert.deepEqual(releaseLines(partial), [
      { arches: ['upper', 'lower'], total: { from: 1, to: 7 }, provisional: false, unlocked: [{ from: 1, to: 4 }] },
    ]);
  });

  it('one line per arch when the plan differs (20 / 14)', () => {
    const lines = releaseLines({
      arches: { upper: arch(20, [{ from: 1, to: 10 }]), lower: arch(14, [{ from: 1, to: 10 }]) },
    });
    assert.deepEqual(
      lines.map((line) => [line.arches, line.total]),
      [
        [['upper'], { from: 1, to: 20 }],
        [['lower'], { from: 1, to: 14 }],
      ],
    );
  });

  it('skips an untreated arch', () => {
    assert.deepEqual(releaseLines(none).map((line) => line.arches), [['upper']]);
  });
});

describe('counters', () => {
  it('reads done over the released steps while the plan is partly released', () => {
    assert.equal(workableStepCount(partial, 'upper'), 4);
    assert.equal(workableStepCount(none, 'upper'), 0);
    assert.equal(workableCounterText(3, 4), '3/4');
  });

  it('falls back to the plan total when everything is released, or without a release block', () => {
    assert.equal(workableStepCount(all, 'upper'), null);
    assert.equal(workableStepCount(undefined, 'upper'), null);
    assert.equal(workableStepCount(none, 'lower'), null);
  });

  it('labels the planned total, provisional with ≈', () => {
    assert.equal(plannedTotalLabel({ total: 7, provisional: false }), '7');
    assert.equal(plannedTotalLabel({ total: 20, provisional: true }), '≈20');
    assert.equal(plannedTotalLabel({ total: null, provisional: true }), null);
    assert.equal(plannedTotalLabel(null), null);
  });
});

describe('lockedParts (the form, every act)', () => {
  it('names the locked steps of the range', () => {
    assert.deepEqual(lockedParts(3, 7, partial, ['upper', 'lower']), [{ from: 5, to: 7 }]);
    assert.deepEqual(lockedParts(1, 4, partial, ['upper']), []);
    assert.deepEqual(lockedParts(1, 2, none, ['upper']), [{ from: 1, to: 2 }]);
  });

  it('nothing is locked once everything is released', () => {
    assert.deepEqual(lockedParts(1, 30, all, ['upper']), []);
  });

  it('steps past an APPROVED total are not "locked" (they do not exist); a provisional total does not cut', () => {
    assert.deepEqual(lockedParts(6, 9, partial, ['upper']), [{ from: 6, to: 7 }]);
    const provisional = {
      state: 'partial',
      arches: { upper: arch(20, [{ from: 1, to: 10 }], true), lower: null },
    };
    assert.deepEqual(lockedParts(9, 22, provisional, ['upper']), [{ from: 11, to: 22 }]);
  });
});

describe('releasedStepTo (the form’s default "À")', () => {
  it('stops at the end of the released span holding "De"', () => {
    assert.equal(releasedStepTo(2, partial, ['upper', 'lower'], 7), 4);
  });

  it('takes the lowest end when the arches differ', () => {
    const differ = {
      state: 'partial',
      arches: { upper: arch(20, [{ from: 1, to: 10 }]), lower: arch(14, [{ from: 1, to: 8 }]) },
    };
    assert.equal(releasedStepTo(1, differ, ['upper', 'lower'], 14), 8);
  });

  it('a "De" outside every released span stays alone', () => {
    assert.equal(releasedStepTo(5, partial, ['upper'], 7), 5);
    assert.equal(releasedStepTo(1, none, ['upper'], 7), 1);
  });

  it('everything released: the planned total, as before', () => {
    assert.equal(releasedStepTo(3, all, ['upper'], 7), 7);
    assert.equal(releasedStepTo(9, all, ['upper'], 7), 9);
    assert.equal(releasedStepTo(3, all, ['upper'], null), 3);
  });
});

describe('the manual unlock (admin « Débloquer la tranche »)', () => {
  it('a 200 for a batch released by its payment, a quote edit or a colleague is « déjà débloquée »', () => {
    assert.equal(unlockedByAnotherAct({ unlockSource: 'payment', unlockedById: null }, 'me'), true);
    assert.equal(unlockedByAnotherAct({ unlockSource: 'installment_cancelled' }, 'me'), true);
    assert.equal(unlockedByAnotherAct({ unlockSource: 'manual', unlockedById: 'colleague' }, 'me'), true);
  });

  it('my own unlock is mine (also when the actor is not in the answer)', () => {
    assert.equal(unlockedByAnotherAct({ unlockSource: 'manual', unlockedById: 'me' }, 'me'), false);
    assert.equal(unlockedByAnotherAct({ unlockSource: 'manual' }, 'me'), false);
    assert.equal(unlockedByAnotherAct({ unlockSource: 'manual', unlockedById: 'x' }, null), false);
  });

  it('a limited pack offers it on every locked batch, never on a released one', () => {
    const batches = [{ status: 'unlocked' }, { status: 'locked' }];
    assert.equal(canOfferBatchUnlock({ isUnlimitedSteps: false }, batches[1], batches), true);
    assert.equal(canOfferBatchUnlock({ isUnlimitedSteps: false }, batches[0], batches), false);
    assert.equal(canOfferBatchUnlock({}, { status: 'delivered' }, batches), false);
  });

  it('an unlimited pack offers it only while nothing is released (one release frees every step)', () => {
    const allLocked = [{ status: 'locked' }, { status: 'locked' }];
    const oneOpen = [{ status: 'unlocked' }, { status: 'locked' }];
    assert.equal(canOfferBatchUnlock({ isUnlimitedSteps: true }, allLocked[0], allLocked), true);
    assert.equal(canOfferBatchUnlock({ isUnlimitedSteps: true }, oneOpen[1], oneOpen), false);
  });
});
