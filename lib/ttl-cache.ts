/**
 * Small shared TTL cache for read-only, approved-data queries against a
 * remote Postgres host (see lib/database-health.ts for the original case
 * this pattern solved: every navigation was re-paying a real network
 * round-trip for data that rarely changes between clicks). globalThis-scoped
 * so it survives Next.js dev/HMR module-instance isolation, same as
 * lib/prisma.ts and lib/database-health.ts.
 */

type CacheEntry = { value: unknown; expiresAt: number };

const globalForTtlCache = globalThis as unknown as { ttlCacheStore?: Map<string, CacheEntry> };

const store = globalForTtlCache.ttlCacheStore ?? new Map<string, CacheEntry>();
globalForTtlCache.ttlCacheStore = store;

export async function getOrSetCached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
