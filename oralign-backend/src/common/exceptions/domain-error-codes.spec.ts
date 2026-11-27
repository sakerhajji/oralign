import {
  ACCOUNT_ACTIVITY_ERROR,
  BATCH_UNLOCK_ERROR,
  REASON_MAX_LENGTH,
  TRANSFER_ERROR,
  validReason,
  WITHHOLDING_ERROR,
} from './domain-error-codes';

describe('validReason (every free-text reason: refusal, manual unlock, reactivation)', () => {
  it('returns the trimmed reason when it is 3-500 characters long', () => {
    expect(validReason('  Montant incorrect  ')).toBe('Montant incorrect');
    expect(validReason('abc')).toBe('abc');
    expect(validReason('x'.repeat(REASON_MAX_LENGTH))).toHaveLength(500);
  });

  it.each([
    [''],
    ['  ab  '],
    ['x'.repeat(REASON_MAX_LENGTH + 1)],
    [null],
    [undefined],
    [42],
  ])('refuses %p', (value) => {
    expect(validReason(value)).toBeNull();
  });
});

describe('domain error codes', () => {
  it('are unique across the programme (a client maps each to one copy)', () => {
    const all = [
      ...Object.values(TRANSFER_ERROR),
      ...Object.values(WITHHOLDING_ERROR),
      ...Object.values(BATCH_UNLOCK_ERROR),
      ...Object.values(ACCOUNT_ACTIVITY_ERROR),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keep the values the decisions froze', () => {
    expect(TRANSFER_ERROR.PROOF_REQUIRED).toBe('PROOF_REQUIRED');
    expect(TRANSFER_ERROR.RECEIPT_TYPE).toBe('RECEIPT_TYPE');
    expect(TRANSFER_ERROR.RECEIPT_TOO_LARGE).toBe('RECEIPT_TOO_LARGE');
    expect(WITHHOLDING_ERROR.WITHHOLDING_DISABLED).toBe('WITHHOLDING_DISABLED');
    expect(WITHHOLDING_ERROR.WITHHOLDING_BELOW_THRESHOLD).toBe(
      'WITHHOLDING_BELOW_THRESHOLD',
    );
    expect(ACCOUNT_ACTIVITY_ERROR.ACCOUNT_DORMANT).toBe('ACCOUNT_DORMANT');
  });
});
