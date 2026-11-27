import {
  AccountActivityEventKind,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import {
  activityAnchor,
  activityStatusOf,
  clampInactivityMonths,
  cycleKeyOf,
  cycleOf,
  DAY_MS,
  daysUntil,
  effectiveDeadline,
  isRuleSubject,
  lastActivityFrom,
  nextSweepAction,
  NO_WARNINGS,
  nominalDeadline,
  noticeFloorOf,
  projectedDeadline,
  warningsOfCycle,
  type ActivityAccount,
} from './doctor-activity.rules';

const at = (iso: string) => new Date(iso);
const plusDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

const account = (over: Partial<ActivityAccount> = {}): ActivityAccount => ({
  role: UserRole.dentist,
  verificationStatus: VerificationStatus.approved,
  isActive: true,
  deletedAt: null,
  createdAt: at('2026-01-10T08:00:00Z'),
  approvedAt: null,
  activityResetAt: null,
  inactiveSince: null,
  ...over,
});

describe('doctor activity rules — anchor and deadline', () => {
  it('anchors on the latest of last order, reactivation and approval', () => {
    expect(
      activityAnchor({
        lastSubmittedOrderAt: at('2026-03-01T10:00:00Z'),
        activityResetAt: at('2026-02-01T10:00:00Z'),
        approvedAt: at('2026-01-15T10:00:00Z'),
        createdAt: at('2026-01-10T08:00:00Z'),
      }),
    ).toEqual(at('2026-03-01T10:00:00Z'));
    // A reactivation after the last order restarts the clock.
    expect(
      activityAnchor({
        lastSubmittedOrderAt: at('2026-03-01T10:00:00Z'),
        activityResetAt: at('2026-09-20T10:00:00Z'),
        approvedAt: null,
        createdAt: at('2026-01-10T08:00:00Z'),
      }),
    ).toEqual(at('2026-09-20T10:00:00Z'));
  });

  it('falls back to approvedAt, then to createdAt, for a doctor without orders', () => {
    expect(
      activityAnchor({
        lastSubmittedOrderAt: null,
        activityResetAt: null,
        approvedAt: at('2026-02-02T09:00:00Z'),
        createdAt: at('2026-01-10T08:00:00Z'),
      }),
    ).toEqual(at('2026-02-02T09:00:00Z'));
    expect(
      activityAnchor({
        lastSubmittedOrderAt: null,
        activityResetAt: null,
        approvedAt: null,
        createdAt: at('2026-01-10T08:00:00Z'),
      }),
    ).toEqual(at('2026-01-10T08:00:00Z'));
  });

  it('adds calendar months, clamped to the end of the month', () => {
    expect(nominalDeadline(at('2026-08-31T12:00:00Z'), 6)).toEqual(
      at('2027-02-28T12:00:00Z'),
    );
    expect(nominalDeadline(at('2026-01-15T00:00:00Z'), 6)).toEqual(
      at('2026-07-15T00:00:00Z'),
    );
  });

  it('keeps the month count within 1-24, 6 for anything unusable', () => {
    expect(clampInactivityMonths(6)).toBe(6);
    expect(clampInactivityMonths(0)).toBe(1);
    expect(clampInactivityMonths(99)).toBe(24);
    expect(clampInactivityMonths(2.5)).toBe(6);
    expect(clampInactivityMonths(null)).toBe(6);
  });

  it('reads the last activity as max(max submittedAt, max createdAt)', () => {
    expect(
      lastActivityFrom({
        submittedAt: at('2026-05-01T00:00:00Z'),
        createdAt: at('2026-04-01T00:00:00Z'),
      }),
    ).toEqual(at('2026-05-01T00:00:00Z'));
    // A legacy row past draft without submittedAt counts by createdAt.
    expect(
      lastActivityFrom({
        submittedAt: at('2026-05-01T00:00:00Z'),
        createdAt: at('2026-06-01T00:00:00Z'),
      }),
    ).toEqual(at('2026-06-01T00:00:00Z'));
    expect(lastActivityFrom({ submittedAt: null, createdAt: null })).toBeNull();
  });
});

describe('doctor activity rules — who is concerned', () => {
  it('concerns approved, live, unblocked dentists only', () => {
    expect(isRuleSubject(account())).toBe(true);
    expect(isRuleSubject(account({ role: UserRole.admin }))).toBe(false);
    expect(
      isRuleSubject(
        account({ verificationStatus: VerificationStatus.pending }),
      ),
    ).toBe(false);
    expect(isRuleSubject(account({ isActive: false }))).toBe(false);
    expect(isRuleSubject(account({ deletedAt: new Date() }))).toBe(false);
  });
});

describe('doctor activity rules — the sweep steps', () => {
  const anchor = at('2026-01-01T09:00:00Z');
  const nominal = nominalDeadline(anchor, 6); // 2026-07-01T09:00Z

  it('does nothing more than 30 days before the deadline', () => {
    expect(
      nextSweepAction({
        nominal,
        warnings: NO_WARNINGS,
        now: plusDays(nominal, -31),
      }),
    ).toBeNull();
  });

  it('warns 30 days before, on time', () => {
    const now = plusDays(nominal, -30);
    expect(nextSweepAction({ nominal, warnings: NO_WARNINGS, now })).toEqual({
      kind: AccountActivityEventKind.warning_30d,
      deadlineAt: nominal,
      daysLeft: 30,
    });
  });

  it('first run past the deadline only warns, with the deadline moved to now + 30 days', () => {
    const now = plusDays(nominal, 90); // rule enabled long after
    expect(nextSweepAction({ nominal, warnings: NO_WARNINGS, now })).toEqual({
      kind: AccountActivityEventKind.warning_30d,
      deadlineAt: plusDays(now, 30),
      daysLeft: 30,
    });
  });

  it('then warns at 7 days before the PUSHED deadline, never at once', () => {
    const warned30At = plusDays(nominal, 90);
    const warnings = { warned30At, warned7At: null };
    expect(effectiveDeadline(nominal, warnings).getTime()).toBe(
      plusDays(warned30At, 30).getTime(),
    );
    expect(
      nextSweepAction({ nominal, warnings, now: plusDays(warned30At, 1) }),
    ).toBeNull();
    expect(
      nextSweepAction({ nominal, warnings, now: plusDays(warned30At, 23) }),
    ).toEqual({
      kind: AccountActivityEventKind.warning_7d,
      deadlineAt: plusDays(warned30At, 30),
      daysLeft: 7,
    });
  });

  it('deactivates only once both warnings went out and the deadline passed', () => {
    const warned30At = plusDays(nominal, -30);
    const warned7At = plusDays(nominal, -7);
    const warnings = { warned30At, warned7At };
    expect(
      nextSweepAction({ nominal, warnings, now: plusDays(nominal, -1) }),
    ).toBeNull();
    expect(nextSweepAction({ nominal, warnings, now: nominal })).toEqual({
      kind: AccountActivityEventKind.deactivated,
      deadlineAt: nominal,
    });
  });

  it('a late 7-day warning still gives its full 7 days', () => {
    const warned30At = plusDays(nominal, -30);
    // The sweep was down: the 7-day warning only leaves on the deadline day.
    const now = nominal;
    const action = nextSweepAction({
      nominal,
      warnings: { warned30At, warned7At: null },
      now,
    });
    expect(action).toEqual({
      kind: AccountActivityEventKind.warning_7d,
      deadlineAt: plusDays(now, 7),
      daysLeft: 7,
    });
    expect(
      nextSweepAction({
        nominal,
        warnings: { warned30At, warned7At: now },
        now: plusDays(now, 6),
      }),
    ).toBeNull();
  });
});

describe('doctor activity rules — status and cycle', () => {
  const now = at('2026-06-10T12:00:00Z');

  it('reads inactive, warned, active', () => {
    expect(
      activityStatusOf({ inactiveSince: now, deadlineAt: null, now }),
    ).toBe('inactive');
    expect(
      activityStatusOf({
        inactiveSince: null,
        deadlineAt: plusDays(now, 30),
        now,
      }),
    ).toBe('warned');
    expect(
      activityStatusOf({
        inactiveSince: null,
        deadlineAt: plusDays(now, -2),
        now,
      }),
    ).toBe('warned');
    expect(
      activityStatusOf({
        inactiveSince: null,
        deadlineAt: plusDays(now, 31),
        now,
      }),
    ).toBe('active');
    expect(
      activityStatusOf({ inactiveSince: null, deadlineAt: null, now }),
    ).toBe('active');
  });

  it('counts whole days left, rounded up, never negative', () => {
    expect(daysUntil(plusDays(now, 6.2), now)).toBe(7);
    expect(daysUntil(plusDays(now, -3), now)).toBe(0);
  });

  it('projects the date the warnings will announce, never a past one', () => {
    const far = plusDays(now, 90);
    // No warning yet: a far deadline stands; a near or past one (the rule
    // just switched on) reads "in 30 days", what the first pass announces.
    expect(
      projectedDeadline({ deadline: far, warnings: NO_WARNINGS }, now),
    ).toEqual(far);
    expect(
      projectedDeadline(
        { deadline: plusDays(now, -40), warnings: NO_WARNINGS },
        now,
      ),
    ).toEqual(plusDays(now, 30));
    // 30-day warning sent, 7-day owed: at least 7 days of notice.
    const warned30 = { warned30At: plusDays(now, -28), warned7At: null };
    expect(
      projectedDeadline(
        { deadline: plusDays(now, 2), warnings: warned30 },
        now,
      ),
    ).toEqual(plusDays(now, 7));
    expect(
      projectedDeadline(
        { deadline: plusDays(now, 20), warnings: warned30 },
        now,
      ),
    ).toEqual(plusDays(now, 20));
    // Both sent: the deadline itself, floored at now (deactivation imminent).
    const both = { ...warned30, warned7At: plusDays(now, -7) };
    expect(
      projectedDeadline({ deadline: plusDays(now, 3), warnings: both }, now),
    ).toEqual(plusDays(now, 3));
    expect(
      projectedDeadline({ deadline: plusDays(now, -1), warnings: both }, now),
    ).toEqual(now);
  });

  it('a projection agrees with what the sweep announces', () => {
    const nominal = plusDays(now, -10);
    const action = nextSweepAction({ nominal, warnings: NO_WARNINGS, now });
    expect(action?.deadlineAt).toEqual(
      projectedDeadline({ deadline: nominal, warnings: NO_WARNINGS }, now),
    );
  });

  it('keeps only the warnings of the current anchor', () => {
    const anchor = at('2026-01-01T09:00:00Z');
    const older = at('2025-06-01T09:00:00Z');
    const rows = [
      {
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: older,
        createdAt: at('2025-11-01T09:00:00Z'),
      },
      {
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: new Date(anchor.getTime()),
        createdAt: at('2026-06-01T09:00:00Z'),
      },
    ];
    expect(warningsOfCycle(rows, anchor)).toEqual({
      warned30At: at('2026-06-01T09:00:00Z'),
      warned7At: null,
    });
  });

  it('builds the whole cycle from the facts', () => {
    const cycle = cycleOf({
      account: account({ approvedAt: at('2026-01-15T10:00:00Z') }),
      lastSubmittedOrderAt: null,
      warningRows: [],
      months: 6,
    });
    expect(cycle).toEqual({
      lastSubmittedOrderAt: null,
      anchor: at('2026-01-15T10:00:00Z'),
      cycleKey: at('2026-01-15T10:00:00Z'),
      nominal: at('2026-07-15T10:00:00Z'),
      warnings: NO_WARNINGS,
      deadline: at('2026-07-15T10:00:00Z'),
    });
  });
});

describe('doctor activity rules — cycle key (rule re-enabled, account unblocked)', () => {
  const anchor = at('2026-01-15T10:00:00Z');

  it('the cycle key is the anchor, moved forward to a later notice floor', () => {
    expect(cycleKeyOf(anchor, null)).toEqual(anchor);
    // A floor older than the anchor (a switch-on before his last order) changes nothing.
    expect(cycleKeyOf(anchor, at('2025-12-01T00:00:00Z'))).toEqual(anchor);
    expect(cycleKeyOf(anchor, at('2026-09-01T00:00:00Z'))).toEqual(
      at('2026-09-01T00:00:00Z'),
    );
  });

  it('the notice floor is the later of the switch-on and the last unblock', () => {
    expect(
      noticeFloorOf({ ruleEnabledAt: null, lastUnblockedAt: null }),
    ).toBeNull();
    expect(
      noticeFloorOf({
        ruleEnabledAt: at('2026-03-01T00:00:00Z'),
        lastUnblockedAt: at('2026-05-01T00:00:00Z'),
      }),
    ).toEqual(at('2026-05-01T00:00:00Z'));
    expect(
      noticeFloorOf({
        ruleEnabledAt: at('2026-06-01T00:00:00Z'),
        lastUnblockedAt: null,
      }),
    ).toEqual(at('2026-06-01T00:00:00Z'));
  });

  it('warningsOfCycle ignores the rows of an older cycle key', () => {
    const firstKey = at('2026-07-01T00:00:00Z');
    const rows = [
      {
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: firstKey,
        createdAt: at('2026-07-01T06:00:00Z'),
      },
      {
        kind: AccountActivityEventKind.warning_7d,
        anchorAt: firstKey,
        createdAt: at('2026-07-24T06:00:00Z'),
      },
    ];
    expect(warningsOfCycle(rows, firstKey)).toEqual({
      warned30At: at('2026-07-01T06:00:00Z'),
      warned7At: at('2026-07-24T06:00:00Z'),
    });
    expect(warningsOfCycle(rows, at('2026-11-01T00:00:00Z'))).toEqual(
      NO_WARNINGS,
    );
  });

  it('a re-enabled rule opens a fresh cycle: old warnings no longer push nor count, the next step is a full 30-day warning', () => {
    const firstOn = at('2026-07-01T00:00:00Z');
    const secondOn = at('2026-11-01T00:00:00Z');
    const warningRows = [
      {
        kind: AccountActivityEventKind.warning_30d,
        anchorAt: firstOn,
        createdAt: at('2026-07-01T06:00:00Z'),
      },
      {
        kind: AccountActivityEventKind.warning_7d,
        anchorAt: firstOn,
        createdAt: at('2026-07-24T06:00:00Z'),
      },
    ];
    const cycle = cycleOf({
      account: account({ approvedAt: anchor }),
      lastSubmittedOrderAt: null,
      warningRows,
      months: 6,
      noticeFloor: secondOn,
    });
    expect(cycle.anchor).toEqual(anchor);
    expect(cycle.cycleKey).toEqual(secondOn);
    expect(cycle.warnings).toEqual(NO_WARNINGS);
    // The deadline still counts from the activity anchor.
    expect(cycle.deadline).toEqual(at('2026-07-15T10:00:00Z'));

    const now = at('2026-11-02T06:00:00Z');
    expect(
      nextSweepAction({
        nominal: cycle.nominal,
        warnings: cycle.warnings,
        now,
      }),
    ).toEqual({
      kind: 'warning_30d',
      deadlineAt: plusDays(now, 30),
      daysLeft: 30,
    });

    // Without the floor (the cycle never interrupted), the same rows lead
    // straight to the deactivation.
    const untouched = cycleOf({
      account: account({ approvedAt: anchor }),
      lastSubmittedOrderAt: null,
      warningRows,
      months: 6,
      noticeFloor: firstOn,
    });
    expect(
      nextSweepAction({
        nominal: untouched.nominal,
        warnings: untouched.warnings,
        now,
      })?.kind,
    ).toBe('deactivated');
  });
});
