import {
  countCoveredSteps,
  coveredStepRanges,
  firstUncoveredStep,
  mergeStepRanges,
  uncoveredStepRanges,
} from './step-ranges';

const r = (from: number, to: number) => ({ from, to });

describe('step ranges', () => {
  describe('mergeStepRanges', () => {
    it('sorts, merges overlaps AND adjacent ranges', () => {
      expect(mergeStepRanges([r(8, 10), r(1, 3), r(4, 5), r(2, 6)])).toEqual([
        r(1, 6),
        r(8, 10),
      ]);
    });

    it('keeps a gap of one step open', () => {
      expect(mergeStepRanges([r(1, 3), r(5, 6)])).toEqual([r(1, 3), r(5, 6)]);
    });

    it('drops empty ranges and never mutates its input', () => {
      const input = [r(5, 4), r(1, 2), r(2, 3)];
      expect(mergeStepRanges(input)).toEqual([r(1, 3)]);
      expect(input).toEqual([r(5, 4), r(1, 2), r(2, 3)]);
    });
  });

  describe('countCoveredSteps', () => {
    it('counts distinct steps: a reprint never inflates the count', () => {
      expect(countCoveredSteps([r(1, 10), r(5, 10), r(1, 3)])).toBe(10);
    });

    it('sums disjoint ranges', () => {
      expect(countCoveredSteps([r(1, 3), r(7, 7)])).toBe(4);
    });

    it('is 0 for nothing', () => {
      expect(countCoveredSteps([])).toBe(0);
    });
  });

  describe('firstUncoveredStep', () => {
    it('is 1 on a fresh case', () => {
      expect(firstUncoveredStep([], 20)).toBe(1);
    });

    it('is right after a contiguous prefix', () => {
      expect(firstUncoveredStep([r(1, 4), r(5, 7)], 20)).toBe(8);
    });

    it('finds the first gap, not the end', () => {
      expect(firstUncoveredStep([r(1, 3), r(6, 9)], 20)).toBe(4);
    });

    it('is null once everything up to a known total is covered', () => {
      expect(firstUncoveredStep([r(1, 20)], 20)).toBeNull();
      expect(firstUncoveredStep([r(1, 25)], 20)).toBeNull();
    });

    it('keeps counting without a known total', () => {
      expect(firstUncoveredStep([r(1, 20)], null)).toBe(21);
    });
  });

  describe('uncoveredStepRanges / coveredStepRanges', () => {
    it('splits a target around what is covered', () => {
      const covered = [r(3, 4), r(7, 8)];
      expect(uncoveredStepRanges(r(1, 10), covered)).toEqual([
        r(1, 2),
        r(5, 6),
        r(9, 10),
      ]);
      expect(coveredStepRanges(r(1, 10), covered)).toEqual([r(3, 4), r(7, 8)]);
    });

    it('a fully covered target has no gap', () => {
      expect(uncoveredStepRanges(r(2, 5), [r(1, 3), r(4, 9)])).toEqual([]);
      expect(coveredStepRanges(r(2, 5), [r(1, 3), r(4, 9)])).toEqual([r(2, 5)]);
    });

    it('nothing covered: the whole target is a gap', () => {
      expect(uncoveredStepRanges(r(2, 5), [r(10, 12)])).toEqual([r(2, 5)]);
      expect(coveredStepRanges(r(2, 5), [r(10, 12)])).toEqual([]);
    });
  });
});
