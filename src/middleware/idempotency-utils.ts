// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Idempotency middleware — internal helpers.
 *
 * Exposes the cache-key composer and the replay-headers filter so both the
 * factory and any future backend implementation can share them without
 * pulling in the entire `idempotency.ts` module (which keeps the public
 * factory surface compact for the size gate).
 *
 * Not exported from `idempotency.ts`; this is implementation detail.
 * @param headers
 * @returns a copy without hop-by-hop, connection and content-length headers,
 *   which a replayed response must not repeat
 */
export function filterReplayHeaders(headers: Record<string, string>,): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value,] of Object.entries(headers,)) {
    const lower = name.toLowerCase();
    if (lower === "set-cookie") { continue; }
    if (lower.startsWith("connection",)) { continue; }
    if (lower === "keep-alive") { continue; }
    if (lower === "transfer-encoding") { continue; }
    if (lower === "upgrade") { continue; }
    if (lower === "content-length") { continue; }
    out[name] = value;
  }

  return out;
}

/**
 * Build the cache key. userId scopes the key
 * (BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r) so two
 * authenticated users sharing an X-Request-Id cannot replay each other's
 * cached responses; unauthenticated requests share the `anon` bucket.
 *
 * The resolved path scopes the key as well (SW-6): the route PATTERN is
 * shared by every resource of a route family, so one client request id used
 * on two different resources replayed the first response and silently
 * dropped the second write.
 * @param method
 * @param routePattern
 * @param requestId
 * @param userId
 * @param resolvedPath - the concrete request path (route params substituted)
 * @returns {string}
 */
export function makeKey(
  method: string,
  routePattern: string,
  requestId: string,
  userId: string | null,
  resolvedPath: string = routePattern,
): string {
  return `${method.toUpperCase()} ${routePattern} ${userId ?? "anon"} ${requestId} ${resolvedPath}`;
}
