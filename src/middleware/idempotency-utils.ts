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
 */

/** Drop headers that must NOT replay (cookies, hop-by-hop). */
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
 */
export function makeKey(
  method: string,
  routePattern: string,
  requestId: string,
  userId: string | null,
): string {
  return `${method.toUpperCase()} ${routePattern} ${userId ?? "anon"} ${requestId}`;
}
