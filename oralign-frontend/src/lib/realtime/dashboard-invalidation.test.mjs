// Run: node --test src/lib/realtime/dashboard-invalidation.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The /dashboard socket fans one event out to the DISTINCT React-Query
// clients (one invalidation per key however many surfaces mounted the
// hook), and each scope refreshes only what it changed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { refCountedSet, statsInvalidationPlan } from './dashboard-invalidation.ts';

describe('statsInvalidationPlan', () => {
  it('refreshes the money lists and the bell after a money event', () => {
    assert.deepEqual(statsInvalidationPlan('all'), {
      dashboard: true,
      money: true,
      unreadCount: true,
    });
  });

  it('refreshes only the transfer-state lists when another admin opens a receipt', () => {
    // No KPI, no badge, no unread row of mine changed; the pending desk
    // and the payment-history rows show the « À vérifier » state.
    assert.deepEqual(statsInvalidationPlan('transfers'), {
      dashboard: false,
      money: true,
      unreadCount: false,
    });
  });

  it('keeps figure-only scopes on the dashboard keys', () => {
    for (const scope of ['kpis', 'analytics', 'packs', undefined, null, 'bogus', 42]) {
      assert.deepEqual(statsInvalidationPlan(scope), {
        dashboard: true,
        money: false,
        unreadCount: false,
      });
    }
  });
});

describe('refCountedSet', () => {
  it('lists a member once however many holders retain it', () => {
    const clients = refCountedSet();
    const queryClient = {};
    // The admin sidebar and the landing page both mount the hook.
    clients.retain(queryClient);
    clients.retain(queryClient);
    assert.deepEqual(clients.values(), [queryClient]);
    assert.equal(clients.size, 1);

    // One stats:invalidate → one invalidation per key, not two.
    let invalidations = 0;
    for (const _client of clients.values()) invalidations += 1;
    assert.equal(invalidations, 1);
  });

  it('keeps a member until its last holder releases it', () => {
    const clients = refCountedSet();
    const queryClient = {};
    clients.retain(queryClient);
    clients.retain(queryClient);
    clients.release(queryClient);
    assert.deepEqual(clients.values(), [queryClient]);
    clients.release(queryClient);
    assert.deepEqual(clients.values(), []);
    assert.equal(clients.size, 0);
  });

  it('ignores a release without a hold and keeps distinct members apart', () => {
    const clients = refCountedSet();
    const a = {};
    const b = {};
    clients.release(a);
    assert.equal(clients.size, 0);
    clients.retain(a);
    clients.retain(b);
    clients.release(a);
    assert.deepEqual(clients.values(), [b]);
  });
});
