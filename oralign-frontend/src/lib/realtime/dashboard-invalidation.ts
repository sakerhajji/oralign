/**
 * The `/dashboard` socket's pure rules: what one `stats:invalidate`
 * message refreshes, and the refcounted set of React-Query clients the ONE
 * listener of the shared socket fans out to.
 *
 * Why a registry: several surfaces mount useDashboardSocket at once (the
 * admin sidebar for the whole session, the doctor landing and its slider).
 * When each mount attached its own socket listener, one event refetched
 * every query once per mount, and the KPI recomputation ran twice per
 * admin. The socket now carries a single listener per event, which walks
 * the DISTINCT clients of this registry: one invalidation per key, however
 * many components mounted the hook.
 *
 * Pure and dependency-free, so `node --test` runs it as is: see
 * dashboard-invalidation.test.mjs.
 */

/**
 * The scopes the backend sends (dashboard.gateway.ts):
 * - `kpis` / `analytics` / `packs`: a figure changed, the dashboard keys only;
 * - `all`: a money event (payment or treatment fee declared, confirmed,
 *   refused, withdrawn, superseded): the money lists and the bell too;
 * - `transfers`: another admin opened a receipt for the first time. Only
 *   the transfer state changed (« Reçu envoyé » → « À vérifier »), shown
 *   by the pending desk AND the payment-history rows; no figure, no badge
 *   and no unread row of mine moved.
 */
export type DashboardStatsScope = 'kpis' | 'analytics' | 'packs' | 'all' | 'transfers';

/** Which query groups one `stats:invalidate` message refetches. */
export interface StatsInvalidationPlan {
  /** The dashboard keys: KPIs, charts, the doctor packs, the sidebar badges. */
  dashboard: boolean;
  /** The transfer queue lists, the payment and treatment-fee lists. */
  money: boolean;
  /** The bell's unread count. */
  unreadCount: boolean;
}

const DASHBOARD_ONLY: StatsInvalidationPlan = {
  dashboard: true,
  money: false,
  unreadCount: false,
};
const EVERYTHING: StatsInvalidationPlan = {
  dashboard: true,
  money: true,
  unreadCount: true,
};
const TRANSFER_STATE: StatsInvalidationPlan = {
  dashboard: false,
  money: true,
  unreadCount: false,
};

/** The plan of one message; an unknown or missing scope refreshes the dashboard keys only. */
export function statsInvalidationPlan(scope: unknown): StatsInvalidationPlan {
  if (scope === 'all') return EVERYTHING;
  if (scope === 'transfers') return TRANSFER_STATE;
  return DASHBOARD_ONLY;
}

/** A set whose members stay while at least one holder retains them. */
export interface RefCountedSet<T> {
  retain(item: T): void;
  /** Drops one hold; the item leaves the set with its last hold. */
  release(item: T): void;
  /** The distinct members, each listed once whatever its hold count. */
  values(): T[];
  readonly size: number;
}

export function refCountedSet<T>(): RefCountedSet<T> {
  const holds = new Map<T, number>();
  return {
    retain(item) {
      holds.set(item, (holds.get(item) ?? 0) + 1);
    },
    release(item) {
      const count = holds.get(item);
      if (count === undefined) return;
      if (count <= 1) holds.delete(item);
      else holds.set(item, count - 1);
    },
    values() {
      return [...holds.keys()];
    },
    get size() {
      return holds.size;
    },
  };
}
