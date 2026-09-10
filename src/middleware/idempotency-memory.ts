// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * In-memory backend for the idempotency middleware.
 *
 * Process-local `Map<key, Entry>`. Lost on restart, not shared across
 * instances. Suitable for dev and single-instance prod where restart
 * resilience + horizontal scale-out are not required.
 *
 * For cross-instance / restart-resilient replay use the table backend
 * (`./idempotency-table.ts`).
 * @see TASK-middleware-global-idempotency-replay-for-re-fired-requests.md
 * @see epic-middleware-request-lifecycle.md
 */

/** Replay entry kept by the in-memory backend. */
export interface InMemoryEntry {
  status: number;
  headers: Record<string, string>;
  body: string;
  inFlight: boolean;
  startedAt: number;
  completedAt: number | null;
}

/** Metadata the table backend persists alongside the row. */
export interface IdempotencyMeta {
  method: string;
  route: string;
  userId: string | null;
}

/**
 * Backend surface — uniform across `memory` and `table`. Methods are
 * synchronous; the table backend hydrates its cache via a fire-and-forget
 * `asyncStore.read()` on miss so subsequent same-key calls hit the fast
 * path. Cross-instance re-fires therefore replay on the **second** arrival
 * in this process, matching the existing test contract that two requests
 * racing in the same tick observe the in-memory fast path.
 */
export interface IdempotencyBackendApi {
  /**
   * Look up an existing entry. Returns `null` for absent keys and silently
   * expires keys past their TTL so the caller treats them as fresh.
   * @param key - composite cache key (method + route + user + requestId)
   */
  get(key: string,): InMemoryEntry | null;
  /** Reserve an in-flight slot (returns the placeholder entry). */
  markInFlight(key: string, meta: IdempotencyMeta,): InMemoryEntry;
  /**
   * Persist a completed response for replay on subsequent same-key calls.
   * Synchronous for the memory backend; the table backend additionally
   * queues a fire-and-forget write through the async store.
   */
  recordResponse(
    key: string,
    meta: IdempotencyMeta,
    args: { status: number; headers: Record<string, string>; body: string; startedAt: number },
  ): void;
  /** Drop the in-flight slot so the next call retries the handler. */
  release(key: string, meta: IdempotencyMeta,): void;
  /** Test seam: drop every in-flight + completed entry. */
  clear(): void;
}

/**
 * Build a fresh memory backend bound to a TTL.
 * @param ttlMs - TTL for completed entries in ms.
 */
export function createMemoryBackend(ttlMs: number,): IdempotencyBackendApi {
  const cache = new Map<string, InMemoryEntry>();

  return {
    get(key,) {
      const entry = cache.get(key,);
      if (!entry) { return null; }
      // TTL expiry: drop silently so the next call is treated as fresh.
      if (entry.completedAt !== null && Date.now() - entry.completedAt > ttlMs) {
        cache.delete(key,);
        return null;
      }
      return entry;
    },
    markInFlight(key,) {
      const entry: InMemoryEntry = {
        status: 0,
        headers: {},
        body: "",
        inFlight: true,
        startedAt: Date.now(),
        completedAt: null,
      };
      cache.set(key, entry,);
      return entry;
    },
    recordResponse(key, _meta, args,) {
      cache.set(key, {
        status: args.status,
        headers: args.headers,
        body: args.body,
        inFlight: false,
        startedAt: args.startedAt,
        completedAt: Date.now(),
      },);
    },
    release(key,) {
      cache.delete(key,);
    },
    clear() {
      cache.clear();
    },
  };
}
