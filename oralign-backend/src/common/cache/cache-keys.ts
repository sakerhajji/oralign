// Centralised cache-key helpers. Keeping every cache key constructor here
// makes invalidation auditable — when a write happens, this file is the
// shopping list of keys to delete.

export const TTL = {
  /** Hot data (changes frequently, but still cacheable) — 1 min. */
  hot: 60_000,
  /** Warm data (e.g. user lists, search results) — 5 min. */
  warm: 5 * 60_000,
  /** Cold data (rarely changes, e.g. working hours) — 30 min. */
  cold: 30 * 60_000,
} as const;

// ─── Dentist profile ────────────────────────────────────────────────────────

export const dpKey = {
  byId: (id: string) => `dp:id:${id}`,
  byUserId: (userId: string) => `dp:user:${userId}`,
  searchByCity: (city: string, page: number, limit: number) =>
    `dp:city:${city.toLowerCase()}:${page}:${limit}`,
  nearby: (
    lat: number,
    lon: number,
    radiusKm: number,
    page: number,
    limit: number,
  ) =>
    // Round coordinates so near-identical queries hit the same cache entry.
    `dp:near:${lat.toFixed(3)}:${lon.toFixed(3)}:${radiusKm}:${page}:${limit}`,
};

// ─── Working hours ──────────────────────────────────────────────────────────

export const whKey = {
  byId: (id: string) => `wh:id:${id}`,
  byProfile: (dentistProfileId: string) => `wh:profile:${dentistProfileId}`,
};
