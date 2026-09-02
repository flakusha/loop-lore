// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 277

/**
 * Async request-response result store.
 *
 * Persists the outcome of tracked async requests to `request_results` so:
 *   - the frontend can poll `GET /api/requests/:id/status` for completion,
 *   - the idempotency layer can replay a previously-completed response
 *     verbatim when a duplicate request arrives.
 *
 * Writes are intentionally **non-blocking**: every public function returns
 * synchronously after queueing the write. A single background writer drains
 * the queue via Kysely `insertInto`/`updateTable`. This keeps the request
 * hot path free of DB latency.
 *
 * Offload: rows whose `response_body` exceeds `MAX_INLINE_BYTES` are
 * compressed (gzip) and spilled to disk by `src/async/offload.ts`; the
 * store is unaware of the offload path and just reports the inlined body.
 * The status endpoint joins with `offload.ts` to resolve the spill.
 * @see TASK-async-request-response-result-store-separate-table-offload.md
 * @see epic-middleware-request-lifecycle.md
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils/safe-json";
import { apply, type Write, } from "./apply";
/** Lifecycle states mirrored in the `status` column. */
export type RequestStatus = "pending" | "in_progress" | "complete" | "failed" | "expired";

/** Inlined row shape consumed by the status endpoint + idempotency replay. */
export interface RequestResultRow {
  id: string;
  method: string;
  routePattern: string;
  userId: string | null;
  status: RequestStatus;
  progress: Record<string, unknown> | null;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  offloadedAt: string | null;
  offloadPath: string | null;
}

/** Snippet of an HTTP response captured for replay. */
export interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Optional metadata tracked alongside the response. */
export interface ProgressUpdate {
  /** Free-form progress payload surfaced on the status endpoint. */
  progress?: Record<string, unknown>;
}

/** Identity carried on every write so `apply()` can scope by owner. */
export interface OwnerRef {
  /** User id (null = anonymous / unauthenticated). */
  userId: string | null;
}

/** Public configuration knobs. All have safe defaults. */
export interface AsyncStoreConfig {
  /** Max inlined `response_body` bytes (default 1 MiB). Larger → offload. */
  maxInlineBytes?: number;
  /** Default TTL for completed rows before eviction (default 24 h). */
  defaultTtlMs?: number;
  /** Maximum pending writes in the queue before dropping (default 10 000). */
  queueLimit?: number;
}

const DEFAULT_MAX_INLINE_BYTES = 1024 * 1024;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUEUE_LIMIT = 10_000;

/**
 * Build a store bound to the given Kysely instance.
 *
 * The returned API is **fire-and-forget**: every method returns immediately.
 * Errors are logged but never thrown on the hot path. Drain `destroy()` at
 * shutdown to flush the in-flight queue.
 * @param database
 * @param config
 */
export function createAsyncStore(database: Kysely<DB>, config: AsyncStoreConfig = {},): AsyncStore {
  const cfg: Required<AsyncStoreConfig> = {
    maxInlineBytes: config.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    defaultTtlMs: config.defaultTtlMs ?? DEFAULT_TTL_MS,
    queueLimit: config.queueLimit ?? DEFAULT_QUEUE_LIMIT,
  };
  const log = getLogger().child({ module: "async-store", },);
  const queue: Write[] = [];
  let draining = false;
  let destroyed = false;

  /**
   * Enqueue a write. Drops on overflow (logs at warn).
   * @param write
   */
  const enqueue = (write: Write,): void => {
    if (destroyed) { return; }
    if (queue.length >= cfg.queueLimit) {
      log.warn("async-store queue full; dropping write", { kind: write.kind, id: "id" in write ? write.id : null, },);
      return;
    }
    queue.push(write,);
    void drain();
  };

  /** Drain the queue serially. Re-entrant-safe via `draining` flag. */
  async function drain(): Promise<void> {
    if (draining) { return; }
    draining = true;
    try {
      while (queue.length > 0) {
        const write = queue.shift();
        if (write === undefined) { break; }
        try {
          await apply(database, write, cfg,);
        } catch (error) {
          log.error("async-store write failed", undefined, { kind: write.kind, error: String(error,), },);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    track(args,) {
      enqueue({
        kind: "upsert",
        id: args.id,
        method: args.method,
        routePattern: args.routePattern,
        userId: args.userId,
        startedAt: new Date().toISOString(),
      },);
    },
    /**
     * Push a progress update. The owner must match the `track()` caller —
     * a client that guesses another user's requestId cannot push progress
     * on their row. BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
     * @param id
     * @param owner
     * @param update
     */
    progress(id: string, owner: OwnerRef, update: ProgressUpdate,) {
      enqueue({
        kind: "progress",
        id,
        userId: owner.userId,
        status: "in_progress",
        progress: update.progress ?? null,
      },);
    },
    /**
     * Mark a request complete. Scoped by `owner.userId` so a client that
     * guesses another user's requestId cannot overwrite their cached
     * response. BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
     * @param id
     * @param owner
     * @param response
     */
    complete(id: string, owner: OwnerRef, response: CapturedResponse,) {
      enqueue({ kind: "complete", id, userId: owner.userId, response, },);
    },
    /**
     * Mark a request failed. Scoped by `owner.userId` for the same reason
     * as `complete()`. BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
     * @param id
     * @param owner
     * @param error
     */
    fail(id: string, owner: OwnerRef, error: string,) {
      enqueue({ kind: "fail", id, userId: owner.userId, error, },);
    },
    async flush(): Promise<void> {
      // Spin until the queue is empty. Used by tests + graceful shutdown.
      while (queue.length > 0 || draining) {
        await drain();
        if (queue.length === 0 && !draining) { break; }
        const { promise, resolve, } = Promise.withResolvers<void>();
        setTimeout(resolve, 5,);
        await promise;
      }
    },
    async read(id: string,): Promise<RequestResultRow | null> {
      const row = await database
        .selectFrom("request_results",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirst();
      return row ? rowToResult(row,) : null;
    },
    config: cfg,
    destroy(): void {
      destroyed = true;
      void drain();
    },
  };
}

/** Public async-store API. All write methods are fire-and-forget. */
export interface AsyncStore {
  track(args: {
    id: string;
    method: string;
    routePattern: string;
    userId: string | null;
  },): void;
  progress(id: string, owner: OwnerRef, update: ProgressUpdate,): void;
  complete(id: string, owner: OwnerRef, response: CapturedResponse,): void;
  fail(id: string, owner: OwnerRef, error: string,): void;
  flush(): Promise<void>;
  read(id: string,): Promise<RequestResultRow | null>;
  readonly config: Required<AsyncStoreConfig>;
  destroy(): void;
}

/**
 * Translate a DB row to the public `RequestResultRow`.
 * @param row
 */
function rowToResult(row: RequestResultsRow,): RequestResultRow {
  return {
    id: row.id,
    method: row.method,
    routePattern: row.route_pattern,
    userId: row.user_id,
    status: row.status as RequestStatus,
    progress: row.progress ? jsonParseOr(row.progress, null,) as Record<string, unknown> | null : null,
    responseStatus: row.response_status,
    responseHeaders: row.response_headers
      ? jsonParseOr(row.response_headers, null,) as Record<string, string> | null
      : null,
    responseBody: row.response_body,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    offloadedAt: row.offloaded_at,
    offloadPath: row.offload_path,
  };
}

/** Minimal row projection matching the generated `RequestResults` shape. */
type RequestResultsRow = {
  id: string;
  method: string;
  route_pattern: string;
  user_id: string | null;
  status: string;
  progress: string | null;
  response_status: number | null;
  response_headers: string | null;
  response_body: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  offloaded_at: string | null;
  offload_path: string | null;
};
export { apply, } from "./apply";
