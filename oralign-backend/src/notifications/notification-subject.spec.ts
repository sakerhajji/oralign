import {
  installmentSubjectKey,
  isTransferSubjectKey,
  parseSubjectKey,
  SUBJECT_KEY_MAX_LENGTH,
  transferSubjectKey,
  treatmentFeeSubjectKey,
} from './notification-subject';

const PAYMENT = '6f1c2a54-0b7e-4c1a-9d3e-2f6a8b9c0d1e';
const ORDER = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';

describe('notification subject keys', () => {
  it('names a pack transfer by its payment', () => {
    expect(installmentSubjectKey(PAYMENT)).toBe(`installment:${PAYMENT}`);
  });

  it('names a treatment-fee declaration by order + declaredAt epoch ms, whatever the input form', () => {
    const at = new Date('2026-11-20T10:11:12.345Z');
    const key = `treatment_fee:${ORDER}:1795169472345`;
    expect(treatmentFeeSubjectKey(ORDER, at)).toBe(key);
    expect(treatmentFeeSubjectKey(ORDER, at.toISOString())).toBe(key);
    expect(treatmentFeeSubjectKey(ORDER, at.getTime())).toBe(key);
  });

  it('matches the migration backfill format (block 4 of 20261127000001_spec_model)', () => {
    // floor(extract(epoch FROM '2026-11-25 08:00:00.001') * 1000)
    expect(
      treatmentFeeSubjectKey('o-3', new Date('2026-11-25T08:00:00.001Z')),
    ).toBe('treatment_fee:o-3:1795593600001');
  });

  it('a re-upload is a new subject', () => {
    expect(
      treatmentFeeSubjectKey(ORDER, new Date('2026-11-20T10:00:00.000Z')),
    ).not.toBe(
      treatmentFeeSubjectKey(ORDER, new Date('2026-11-20T10:00:00.001Z')),
    );
  });

  it.each([
    ['empty', ''],
    ['a separator', 'a:b'],
    ['a slash', 'a/b'],
    ['a space', 'a b'],
  ])('refuses an id with %s (programmer error)', (_label, id) => {
    expect(() => installmentSubjectKey(id)).toThrow(TypeError);
    expect(() => treatmentFeeSubjectKey(id, 0)).toThrow(TypeError);
  });

  it.each([['not a date'], [-1], [Number.NaN], [1.5]])(
    'refuses a declaration instant %p',
    (at) => {
      expect(() => treatmentFeeSubjectKey(ORDER, at as never)).toThrow(
        TypeError,
      );
    },
  );

  it('parses both kinds back (round trip)', () => {
    expect(parseSubjectKey(`installment:${PAYMENT}`)).toEqual({
      kind: 'installment',
      paymentId: PAYMENT,
    });
    const tf = parseSubjectKey(`treatment_fee:${ORDER}:1795169472345`);
    expect(tf).toEqual({
      kind: 'treatment_fee',
      orderId: ORDER,
      declaredAtMs: 1795169472345,
    });
    expect(transferSubjectKey(tf!)).toBe(
      `treatment_fee:${ORDER}:1795169472345`,
    );
    expect(
      transferSubjectKey({ kind: 'installment', paymentId: PAYMENT }),
    ).toBe(`installment:${PAYMENT}`);
  });

  it.each([
    [undefined],
    [42],
    [''],
    ['installment'],
    ['installment:'],
    [`installment:${PAYMENT}:extra`],
    [`treatment_fee:${ORDER}`],
    [`treatment_fee:${ORDER}:12.5`],
    [`treatment_fee:${ORDER}:-1`],
    [`treatment_fee:${ORDER}:9999999999999999`],
    [`payment:${PAYMENT}`],
    [`installment:${'a'.repeat(SUBJECT_KEY_MAX_LENGTH)}`],
  ])('rejects the malformed key %p', (key) => {
    expect(parseSubjectKey(key)).toBeNull();
    expect(isTransferSubjectKey(key)).toBe(false);
  });

  it('accepts a well-formed key', () => {
    expect(isTransferSubjectKey(installmentSubjectKey(PAYMENT))).toBe(true);
  });
});
