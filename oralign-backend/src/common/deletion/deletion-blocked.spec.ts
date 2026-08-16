import {
  DELETION_BLOCKED,
  DeletionBlockedException,
  assertNoDependents,
} from './deletion-blocked';

describe('assertNoDependents', () => {
  it('is silent when nothing depends on the row', () => {
    expect(() =>
      assertNoDependents('This order', [
        { label: 'quotation', count: 0 },
        { label: 'payments', count: 0 },
      ]),
    ).not.toThrow();
  });

  it('throws a 409 DELETION_BLOCKED naming only the blocking dependencies', () => {
    let caught: unknown;
    try {
      assertNoDependents('This account', [
        { label: 'patients', count: 3 },
        { label: 'orders', count: 0 },
        { label: 'quotations', count: 1 },
      ]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DeletionBlockedException);
    const err = caught as DeletionBlockedException;
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe(DELETION_BLOCKED);
    expect(err.message).toContain('3 patients');
    expect(err.message).toContain('1 quotations');
    expect(err.message).not.toContain('orders');
    expect(err.message).toContain('Archive it instead');
    expect(err.dependencies).toEqual([
      { label: 'patients', count: 3 },
      { label: 'quotations', count: 1 },
    ]);
  });
});
