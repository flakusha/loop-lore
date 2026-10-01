// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260

/**
 * Table backend for the idempotency middleware — replays completed responses
 * from `request_results` after a process restart or from a sibling instance.
 *
 * In-memory fast path holds the in-flight slot + recent completed entries, so
 * the beforeHandle hot path never awaits the DB; persistence is fire-and-forget
 * via `asyncStore`, and a miss triggers a background `asyncStore.read()`
 * hydrate visible on the next call.
 *
 * Rows are keyed by the full cache key (`METHOD route userId requestId`), not
 * by raw X-Request-Id, so `GET /api/requests/:id/status` addresses a disjoint
 * row set. BUG-bug-idempotency-table-backend-accepted-but-never-implemented.
 * @see TASK-middleware-global-idempotency-replay-for-re-fired-requests.md
 */

import type { AsyncStore, RequestResultRow, } from "../async/store";
import { getLogger, } from "../logger";
import { parseExpiryMs, } from "../utils/date";
import type { IdempotencyBackendApi, InMemoryEntry, } from "./idempotency-memory";

/**
 * Bare `getLogger()` (not `.child()`), re-fetched per call so test transports
 * registered via `setGlobalLogger()` / `addTransport()` are always observed;
 * the `module` tag rides on warn-meta. Same rationale as `idempotency.ts`.
 */
function getLog() {
  try {
    return getLogger();
  } catch {
    return null;
  }
}

/** Translate a `RequestResultRow` into the beforeHandle replay entry shape. */
function rowToEntry(row: RequestResultRow,): InMemoryEntry {
  const headers = row.responseHeaders ?? {};
  // The async store's `started_at` / `completed_at` are ISO strings; parse
  // to ms since epoch. Parsing failures fall back to `Date.now()` — TTL
  // semantics still hold because the freshly hydrated entry is live for
  // the full TTL window from `completedAt`.
  const startedAtMs = parseExpiryMs(row.startedAt,) ?? Date.now();
  const completedAtMs = parseExpiryMs(row.completedAt,) ?? Date.now();
  return {
    status: row.responseStatus ?? 0,
    headers,
    body: row.responseBody ?? "",
    inFlight: false,
    startedAt: startedAtMs,
    completedAt: completedAtMs,
  };
}

/** Build a table backend. `asyncStore` must target the same `request_results` table. */
export function createTableBackend(ttlMs: number, asyncStore: AsyncStore,): IdempotencyBackendApi {
  // Process-local fast path. Hydrated lazily from the table on first miss.
  const cache = new Map<string, InMemoryEntry>();
  // De-dupe in-flight hydrates so a thundering-herd of concurrent get()
  // misses (e.g. a fanout retry) issues one DB read per key, not N.
  const inflightHydrates = new Map<string, Promise<void>>();

  /** Drop completed entries past their TTL. */
  const liveEntry = (key: string, entry: InMemoryEntry,): InMemoryEntry | null => {
    if (entry.completedAt !== null && Date.now() - entry.completedAt > ttlMs) {
      cache.delete(key,);
      return null;
    }
    return entry;
  };

  return {
    get(key,) {
      const cached = cache.get(key,);
      if (cached) { return liveEntry(key, cached,); }
      // Fast-path miss — kick off a background DB read to hydrate the cache
      // Coalesce concurrent hydrates for the same key. If a hydrate is
      // already in flight, share its promise — additional callers do NOT
      // trigger a second DB read.
      let pending = inflightHydrates.get(key,);
      if (!pending) {
        pending = hydrateFromTable(key, asyncStore, cache, ttlMs,);
        inflightHydrates.set(key, pending,);
        // Clear the slot once the read settles so a subsequent miss
        // (e.g. after a process restart cleared the local cache) issues
        // a fresh read.
        pending.finally(() => inflightHydrates.delete(key,));
      }
      return null;
    },
    markInFlight(key, meta,) {
      // Reserve the slot locally so concurrent same-process re-fires see the
      // in-flight marker immediately (no DB round-trip).
      const entry: InMemoryEntry = {
        status: 0,
        headers: {},
        body: "",
        inFlight: true,
        startedAt: Date.now(),
        completedAt: null,
      };
      cache.set(key, entry,);
      // Persist asynchronously so cross-instance re-fires observe the
      // in-flight state on the **next** arrival (after the queue flush).
      asyncStore.track({
        id: key,
        method: meta.method,
        routePattern: meta.route,
        userId: meta.userId,
      },);
      return entry;
    },
    recordResponse(key, meta, args,) {
      // Update the local fast path first so same-process re-fires replay
      // immediately without a DB round-trip.
      cache.set(key, {
        status: args.status,
        headers: args.headers,
        body: args.body,
        inFlight: false,
        startedAt: args.startedAt,
        completedAt: Date.now(),
      },);
      // Persist asynchronously. `asyncStore.complete()` writes the response
      // body + status + headers into `request_results` so future processes
      // (or sibling instances) can replay it.
      void asyncStore.complete(
        key,
        { userId: meta.userId, },
        { status: args.status, headers: args.headers, body: args.body, },
      );
    },
    release(key, _meta,) {
      // Drop the local fast-path entry so the next call retries the handler.
      cache.delete(key,);
      // The table row was never written as `complete` — release simply
      // abandons the in-flight slot. Future re-fires against the same key
      // will see no row on hydrate and proceed.
    },
    clear() {
      cache.clear();
    },
  };
}

/**
 * Background hydrate for a single key. Failures are swallowed so a transient
 * DB blip cannot crash the beforeHandle hot path.
 */
async function hydrateFromTable(
  key: string,
  asyncStore: AsyncStore,
  cache: Map<string, InMemoryEntry>,
  ttlMs: number,
): Promise<void> {
  try {
    const row = await asyncStore.read(key,);
    if (!row) { return; }
    if (row.status === "complete" && row.responseStatus !== null && row.responseBody !== null) {
      const entry = rowToEntry(row,);
      // Drop the entry if it would already be expired by TTL.
      if (entry.completedAt !== null && Date.now() - entry.completedAt > ttlMs) { return; }
      // Race protections on hydrate (must NOT overwrite a fresher entry):
      //   (1) In-flight reservation wins — a `markInFlight` is fresher than
      //       any persisted row because the handler has not yet recorded
      //       a response. If we clobber it, a third concurrent caller
      //       would replay the persisted row instead of waiting for the
      //       handler — silently dropping the in-flight request's response.
      //   (2) A new completed entry wins over an older one — a slow hydrate
      //       from a sibling instance can otherwise overwrite a fresh local
      //       `recordResponse` with stale data.
      const existing = cache.get(key,);
      if (existing && existing.inFlight) { return; }
      if (
        existing && existing.completedAt !== null && entry.completedAt !== null &&
        existing.completedAt >= entry.completedAt
      ) { return; }
      cache.set(key, entry,);
    }
  } catch (error) {
    // Background hydration failures are logged at warn so observability
    // surfaces DB outages. The caller still proceeds to run the handler
    // and the next re-fire will retry the hydrate.
    getLog()?.warn("idempotency-table.hydrate_failed", {
      module: "idempotency-table",
      methodRoute: redactKeyForLog(key,),
      error: error instanceof Error ? error.message : String(error,),
    },);
  }
}

/**
 * PII-safe log identifier: the key embeds userId + requestId, so keep only the
 * `METHOD ROUTE` prefix — the access log's requestId carries the correlation.
 */
export function redactKeyForLog(key: string,): string {
  // Cache key format (fixed by `makeKey`):
  // `METHOD ROUTE USER REQUEST_ID` — 4 space-separated tokens. Take the
  // first two.
  const parts = key.split(" ", 2,);
  return parts.length === 2 ? `${parts[0]} ${parts[1]}` : key;
}
