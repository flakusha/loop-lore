// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared generation discovery cache.
 *
 * One bounded TTL cache backs every `/object_info`-style discovery (LoRA
 * models, sampler/scheduler enums). Discovery routes never pay for a second
 * fetch of the same snapshot, and there is no parallel cache to drift.
 * @module generation/discovery-cache
 */

/** Five minutes — the LoRA discovery TTL this cache was extracted from. */
export const DISCOVERY_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Options for {@link cachedDiscovery}. */
export interface CachedDiscoveryOptions<T,> {
  /** Cache lifetime; defaults to {@link DISCOVERY_TTL_MS}. */
  ttlMs?: number;
  /** Bypass the read, still write the fresh result. */
  forceRefresh?: boolean;
  /** Return false to skip caching (e.g. an unreachable backend). */
  shouldCache?: (value: T,) => boolean;
}

/**
 * Read through the shared cache, calling `load` on a miss.
 * @param key - Stable cache key (backend and/or base URL)
 * @param load - Discovery operation
 * @param options
 * @returns the cached or freshly discovered value
 */
export async function cachedDiscovery<T,>(
  key: string,
  load: () => Promise<T>,
  options?: CachedDiscoveryOptions<T>,
): Promise<T> {
  if (!options?.forceRefresh) {
    const hit = cache.get(key,);
    if (hit && hit.expiresAt > Date.now()) { return hit.value as T; }
  }

  const value = await load();
  if (options?.shouldCache?.(value,) ?? true) {
    cache.set(key, { value, expiresAt: Date.now() + (options?.ttlMs ?? DISCOVERY_TTL_MS), },);
  }

  return value;
}

/** Live cached values whose key starts with `prefix`. */
export function cachedValues<T,>(prefix: string,): T[] {
  const now = Date.now();
  const values: T[] = [];
  for (const [key, entry,] of cache) {
    if (key.startsWith(prefix,) && entry.expiresAt > now) { values.push(entry.value as T,); }
  }

  return values;
}

/** Clear every entry, or only keys beginning with `prefix`. */
export function clearCachedDiscovery(prefix?: string,): void {
  if (prefix === undefined) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix,)) { cache.delete(key,); }
  }
}

/** Cache size and soonest expiry, for the management route. */
export function getCacheStatus(): { entries: number; nextExpiration: number | null } {
  let nextExpiration: number | null = null;
  for (const entry of cache.values()) {
    if (nextExpiration === null || entry.expiresAt < nextExpiration) { nextExpiration = entry.expiresAt; }
  }

  return { entries: cache.size, nextExpiration, };
}
