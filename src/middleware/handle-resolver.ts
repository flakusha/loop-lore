// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User handle resolver — userId → username.
 *
 * Used by:
 *   - access log (server/handler.ts): every request gets a handle for forensics
 *   - authz audit (middleware/permissions.ts): every 403 logs handle + userId
 *
 * Lazy resolution with a small TTL cache avoids the per-request DB hit
 * that an inline join would impose. Cache is bounded; eviction is FIFO.
 *
 * The resolver is constructed once at server start (in createRequestHandler)
 * and shared across requests.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/** Default cache TTL — handles rarely change; 5 min is enough for forensics. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Default cache size — covers ~99% of active users in a single window. */
const DEFAULT_MAX_ENTRIES = 1000;

interface CacheEntry {
  handle: string | null;
  /** Absolute ms timestamp; entry is stale when Date.now() >= expiresAt. */
  expiresAt: number;
}

export interface HandleResolver {
  /** userId → username (cached, may return null for unknown users). */
  resolve: (userId: string,) => Promise<string | null>;
  /** Drop all cached entries — call when a bulk rename happens. */
  invalidate: () => void;
  /** Drop one entry — call after a single rename. */
  invalidateOne: (userId: string,) => void;
}

/**
 * Build a resolver bound to the given DB.
 *
 * @param database - App Kysely instance (passed in to keep this stateless).
 * @param opts - TTL + max entries overrides (testing only).
 */
export function createHandleResolver(
  database: Kysely<DB>,
  opts: { ttlMs?: number; maxEntries?: number } = {},
): HandleResolver {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, CacheEntry>();

  async function resolve(userId: string,): Promise<string | null> {
    const cached = cache.get(userId,);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      // Promote on hit (delete + set moves to back, preserving FIFO eviction)
      cache.delete(userId,);
      cache.set(userId, cached,);
      return cached.handle;
    }

    const row = await database
      .selectFrom("users",)
      .select("username",)
      .where("id", "=", userId,)
      .executeTakeFirst();

    const handle = row?.username ?? null;

    if (cache.size >= maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) { cache.delete(firstKey,); }
    }
    cache.set(userId, { handle, expiresAt: now + ttlMs, },);
    return handle;
  }

  function invalidate(): void {
    cache.clear();
  }

  function invalidateOne(userId: string,): void {
    cache.delete(userId,);
  }

  return { resolve, invalidate, invalidateOne, };
}
