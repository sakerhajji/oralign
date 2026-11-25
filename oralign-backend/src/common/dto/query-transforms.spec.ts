import { rawBoolean } from './query-transforms';

/** As class-transformer calls it: the raw plain object and the key. */
const read = (raw: unknown) => rawBoolean({ obj: { flag: raw }, key: 'flag' });

describe('rawBoolean', () => {
  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
  ])('%p → %p', (raw, expected) => {
    expect(read(raw)).toBe(expected);
  });

  it.each([undefined, null, ''])('%p → undefined (not set)', (raw) => {
    expect(read(raw)).toBeUndefined();
  });

  it('leaves anything else for @IsBoolean to refuse', () => {
    expect(read('yes')).toBe('yes');
    expect(read(1)).toBe(1);
  });

  it('survives a missing object', () => {
    expect(rawBoolean({ obj: undefined, key: 'flag' })).toBeUndefined();
  });
});
