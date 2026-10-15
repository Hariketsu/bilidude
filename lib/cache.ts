import { deleteCacheEntries, listCacheEntries, type CacheEntry } from './db';

export interface CachePolicy {
  /** Expire transcripts unused for `days`, keep the cache under `megabytes`, or keep everything. */
  mode: 'age' | 'size' | 'never';
  days: number;
  megabytes: number;
}

export const DEFAULT_CACHE_POLICY: CachePolicy = { mode: 'age', days: 30, megabytes: 200 };
export const CACHE_DAYS = [7, 30, 90] as const;
export const CACHE_MEGABYTES = [50, 200, 500] as const;

const DAY_MS = 86_400_000;
const LAST_PRUNE_KEY = 'cachePrunedAt';

/**
 * Applies the policy to cached transcripts and leftover ASR chunks. Transcripts of
 * videos in the history are always kept: their citations are checked against them,
 * and a transcribed one would have to be transcribed again.
 */
export async function pruneCache(policy: CachePolicy, now = Date.now()) {
  if (policy.mode === 'never') return;
  const all = await listCacheEntries();
  const candidates = all.filter((e) => !e.inHistory);
  let doomed: CacheEntry[];
  if (policy.mode === 'age') {
    doomed = candidates.filter((e) => now - e.usedAt > policy.days * DAY_MS);
  } else {
    let total = all.reduce((sum, e) => sum + e.bytes, 0);
    const limit = policy.megabytes * 1024 * 1024;
    doomed = [];
    // Least recently used first.
    for (const entry of candidates.sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= limit) break;
      doomed.push(entry);
      total -= entry.bytes;
    }
  }
  if (doomed.length > 0) await deleteCacheEntries(doomed);
}

/** Runs `pruneCache` at most once a day; called when the panel opens. */
export async function pruneCacheDaily(policy: CachePolicy) {
  const last = ((await browser.storage.local.get(LAST_PRUNE_KEY))[LAST_PRUNE_KEY] as number | undefined) ?? 0;
  if (Date.now() - last < DAY_MS) return;
  await browser.storage.local.set({ [LAST_PRUNE_KEY]: Date.now() });
  await pruneCache(policy);
}

export async function cacheUsage(): Promise<{ bytes: number; historyBytes: number }> {
  const entries = await listCacheEntries();
  return {
    bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    historyBytes: entries.filter((e) => e.inHistory).reduce((sum, e) => sum + e.bytes, 0),
  };
}

/** Removes everything not needed by the history. */
export async function clearCache() {
  await deleteCacheEntries((await listCacheEntries()).filter((e) => !e.inHistory));
}
