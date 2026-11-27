// Run: node --test src/lib/account-activity/account-activity.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The frontend side of the doctor inactivity rule (spec §5) must read like
// the backend (oralign-backend/src/users/activity/): dormant = inactiveSince
// set, the reason is 3-500 characters once trimmed, days are Tunis days.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNT_NOTICE_TYPES,
  ACTIVITY_FILTER_VALUES,
  accountNoticeNeedsRefresh,
  activityBannerOf,
  activityEventLabelKey,
  adoptActivityFilter,
  activityParamOf,
  activityStatusLabelKey,
  activityToneOf,
  canOrderFor,
  daysUntil,
  formatActivityDateTime,
  formatActivityDay,
  isAccountDormantCode,
  isAccountNoticeType,
  isSystemEvent,
  reactivationReasonOf,
  readActivityFilter,
  unreadCountRose,
  withActivityFilter,
} from './account-activity.ts';

const params = (query) => new URLSearchParams(query);

describe('canOrderFor', () => {
  it('closes ordering for a dormant account only', () => {
    assert.deepEqual(canOrderFor({ inactiveSince: '2026-11-01T08:00:00.000Z' }), {
      canOrder: false,
      reason: 'dormant',
    });
    assert.deepEqual(canOrderFor({ inactiveSince: null }), { canOrder: true, reason: null });
    assert.deepEqual(canOrderFor({}), { canOrder: true, reason: null });
    assert.deepEqual(canOrderFor(null), { canOrder: true, reason: null });
    assert.deepEqual(canOrderFor(undefined), { canOrder: true, reason: null });
  });

  it('recognises the 403 errorCode', () => {
    assert.equal(isAccountDormantCode('ACCOUNT_DORMANT'), true);
    assert.equal(isAccountDormantCode('PASSWORD_CHANGE_REQUIRED'), false);
    assert.equal(isAccountDormantCode(null), false);
  });
});

describe('reactivationReasonOf', () => {
  it('trims and keeps 3-500 characters, like the backend', () => {
    assert.equal(reactivationReasonOf('  Reprise des cas  '), 'Reprise des cas');
    assert.equal(reactivationReasonOf('abc'), 'abc');
    assert.equal(reactivationReasonOf('  ab  '), null);
    assert.equal(reactivationReasonOf(''), null);
    assert.equal(reactivationReasonOf('x'.repeat(500)), 'x'.repeat(500));
    assert.equal(reactivationReasonOf('x'.repeat(501)), null);
    // Surrounding blanks never count towards the limit.
    assert.equal(reactivationReasonOf(` ${'x'.repeat(500)} `), 'x'.repeat(500));
  });
});

describe('activity filter in the address bar', () => {
  it('reads only the known values', () => {
    assert.equal(readActivityFilter(params('activity=inactive')), 'inactive');
    assert.equal(readActivityFilter(params('activity=warned&role=dentist')), 'warned');
    assert.equal(readActivityFilter(params('activity=dormant')), 'all');
    assert.equal(readActivityFilter(params('')), 'all');
    assert.deepEqual([...ACTIVITY_FILTER_VALUES], ['all', 'active', 'warned', 'inactive']);
  });

  it('writes the key and keeps every other parameter', () => {
    assert.equal(withActivityFilter('?role=dentist&page=2', 'inactive'), '?role=dentist&page=2&activity=inactive');
    assert.equal(withActivityFilter('role=dentist&activity=warned', 'all'), '?role=dentist');
    assert.equal(withActivityFilter('?activity=warned', 'all'), '');
    assert.equal(withActivityFilter('', 'active'), '?activity=active');
  });

  it('sends nothing to the API at "all"', () => {
    assert.equal(activityParamOf('all'), undefined);
    assert.equal(activityParamOf('warned'), 'warned');
  });
});

describe('status and journal', () => {
  it('counts whole days left, rounded up, never negative', () => {
    const now = new Date('2026-11-27T10:00:00.000Z');
    assert.equal(daysUntil('2026-12-27T10:00:00.000Z', now), 30);
    assert.equal(daysUntil('2026-11-27T10:00:01.000Z', now), 1);
    assert.equal(daysUntil('2026-11-20T10:00:00.000Z', now), 0);
    assert.equal(daysUntil('not a date', now), 0);
  });

  it('maps statuses and events to tones and dictionary keys', () => {
    assert.equal(activityToneOf('inactive'), 'dormant');
    assert.equal(activityToneOf('warned'), 'warning');
    assert.equal(activityToneOf('active'), 'neutral');
    assert.equal(activityStatusLabelKey('warned'), 'accountActivity.status.warned');
    assert.equal(activityEventLabelKey('warning_7d'), 'accountActivity.events.warning_7d');
    assert.equal(isSystemEvent({ actor: null }), true);
    assert.equal(isSystemEvent({ actor: { id: 'u', name: 'Admin', role: 'admin' } }), false);
  });
});

describe('activityBannerOf', () => {
  const activity = (over = {}) => ({
    status: 'warned',
    lastSubmittedOrderAt: null,
    anchorAt: '2026-05-01T00:00:00.000Z',
    deadlineAt: '2026-12-10T00:00:00.000Z',
    inactiveSince: null,
    activityResetAt: null,
    ruleEnabled: true,
    ...over,
  });

  it('dormant wins over everything', () => {
    assert.deepEqual(
      activityBannerOf({ inactiveSince: '2026-11-01T06:00:00.000Z', activity: activity() }),
      { kind: 'dormant', since: '2026-11-01T06:00:00.000Z' },
    );
  });

  it('warns only while the rule runs and the deadline is near', () => {
    assert.deepEqual(activityBannerOf({ inactiveSince: null, activity: activity() }), {
      kind: 'warned',
      deadlineAt: '2026-12-10T00:00:00.000Z',
    });
    assert.equal(activityBannerOf({ activity: activity({ ruleEnabled: false }) }), null);
    assert.equal(activityBannerOf({ activity: activity({ status: 'active' }) }), null);
    assert.equal(activityBannerOf({ activity: activity({ deadlineAt: null }) }), null);
    assert.equal(activityBannerOf({ activity: null }), null);
    assert.equal(activityBannerOf(null), null);
  });
});

describe('Tunis days', () => {
  it('shows the Tunis calendar day (UTC+1), not the UTC one', () => {
    // 23:30 UTC on Dec 31 is already Jan 1 in Tunis.
    assert.equal(formatActivityDay('2026-12-31T23:30:00.000Z', 'fr'), '1 janv. 2027');
    assert.equal(formatActivityDay('2026-12-31T23:30:00.000Z', 'en'), 'Jan 1, 2027');
    assert.equal(formatActivityDay('nope', 'fr'), '—');
  });

  it('shows Tunis wall-clock times', () => {
    const fr = formatActivityDateTime('2026-11-27T08:05:00.000Z', 'fr');
    assert.match(fr, /27 nov\. 2026/);
    assert.match(fr, /09:05/);
    assert.match(formatActivityDateTime('2026-11-27T08:05:00.000Z', 'en'), /09:05/);
  });
});

describe('keeping /users/me in step with the account', () => {
  // Spec §5 / §11 "reactivate": the doctor's open session must be able to
  // order again without a reload once an admin reactivates him.
  it('knows the account notices by their NotificationType value', () => {
    assert.deepEqual([...ACCOUNT_NOTICE_TYPES].sort(), [
      'account_deactivated',
      'account_inactivity_warning',
      'account_reactivated',
    ]);
    assert.equal(isAccountNoticeType('account_reactivated'), true);
    assert.equal(isAccountNoticeType('payment_confirmed'), false);
    // The admins' notice is about another account, not theirs.
    assert.equal(isAccountNoticeType('doctor_deactivated_inactivity'), false);
    assert.equal(isAccountNoticeType(undefined), false);
  });

  it('sees a rise of the unread count, not the first reading', () => {
    assert.equal(unreadCountRose(undefined, 3), false);
    assert.equal(unreadCountRose(2, undefined), false);
    assert.equal(unreadCountRose(2, 2), false);
    assert.equal(unreadCountRose(3, 2), false);
    assert.equal(unreadCountRose(2, 3), true);
    assert.equal(unreadCountRose(0, 1), true);
  });

  it('re-reads /users/me for an account notice newer than its snapshot', () => {
    const fetchedAt = Date.parse('2026-11-27T10:00:00.000Z');
    const reactivated = { type: 'account_reactivated', createdAt: '2026-11-27T10:05:00.000Z' };
    const oldNotice = { type: 'account_deactivated', createdAt: '2026-11-20T08:00:00.000Z' };
    const other = { type: 'payment_confirmed', createdAt: '2026-11-27T11:00:00.000Z' };
    assert.equal(accountNoticeNeedsRefresh([oldNotice, reactivated], fetchedAt), true);
    // Older than the snapshot: already reflected, no refetch (no loop).
    assert.equal(accountNoticeNeedsRefresh([oldNotice], fetchedAt), false);
    // Any other notice never touches /users/me.
    assert.equal(accountNoticeNeedsRefresh([other], fetchedAt), false);
    // Never read: any account notice is newer.
    assert.equal(accountNoticeNeedsRefresh([oldNotice], 0), true);
    assert.equal(
      accountNoticeNeedsRefresh([{ type: 'account_reactivated', createdAt: 'nope' }], 0),
      false,
    );
    assert.equal(accountNoticeNeedsRefresh(undefined, fetchedAt), false);
    assert.equal(accountNoticeNeedsRefresh([], fetchedAt), false);
  });
});

describe('adoptActivityFilter (a link followed while the users desk is open)', () => {
  it('adopts the bell link’s filter', () => {
    // On /dashboard/users with no filter, the admin clicks « Compte
    // praticien passé en inactif » (?role=dentist&activity=inactive).
    assert.equal(adoptActivityFilter(null, 'inactive', 'all'), 'inactive');
    assert.equal(adoptActivityFilter('warned', 'inactive', 'warned'), 'inactive');
    // A plain link to the desk drops the filter.
    assert.equal(adoptActivityFilter('inactive', null, 'inactive'), 'all');
  });

  it('ignores the desk’s own writes and unchanged addresses', () => {
    // The desk wrote what it already holds.
    assert.equal(adoptActivityFilter(null, 'warned', 'warned'), null);
    assert.equal(adoptActivityFilter('warned', null, 'all'), null);
    // Nothing changed in the address.
    assert.equal(adoptActivityFilter('inactive', 'inactive', 'all'), null);
    // An unknown value reads as 'all', like on mount.
    assert.equal(adoptActivityFilter(null, 'bogus', 'all'), null);
    assert.equal(adoptActivityFilter(null, 'bogus', 'warned'), 'all');
  });
});
