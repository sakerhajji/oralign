import {
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password';

describe('generateTemporaryPassword', () => {
  const samples = Array.from({ length: 300 }, () =>
    generateTemporaryPassword(),
  );

  it(`is at least ${TEMPORARY_PASSWORD_LENGTH} characters (12 is the floor)`, () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
    for (const value of samples) {
      expect(value).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    }
    // A shorter request is raised to the floor, never weakened.
    expect(generateTemporaryPassword(6)).toHaveLength(
      TEMPORARY_PASSWORD_LENGTH,
    );
  });

  it('never contains a look-alike character (0 O o 1 I i l)', () => {
    for (const value of samples) {
      expect(value).not.toMatch(/[0Oo1Iil]/);
      expect(value).toMatch(/^[A-Za-z2-9]+$/);
    }
  });

  it('always mixes upper case, lower case and digits', () => {
    for (const value of samples) {
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[2-9]/);
    }
  });

  it('does not repeat itself', () => {
    expect(new Set(samples).size).toBe(samples.length);
  });
});
