// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 285

/**
 * Global idempotency middleware for re-fired requests.
 *
 * Replaces the previous per-row swipe-index retry with a (method, route,
 * request-id) keyed cache so that a network blip, page reload, or client
 * crash does not duplicate side-effects on the server.
 *
 * Behavior matrix (per request id):
 *   - First request lands      → handler runs; response captured.
 *   - Re-fire while in flight  → 409 `in_progress` (frontend polls status).
 *   - Re-fire after completion → response replayed verbatim from cache.
 *   - Re-fire after TTL        → treated as fresh; handler runs again.
 *   - `Idempotency-Key` absent → pass-through (handler still runs).
 *
 * Backends (selected via `IdempotencyConfig.backend`):
 *   - `memory` — `Map<key, Entry>`; process-local, fast, lost on restart.
 *     Suitable for dev / single-instance prod.
 *   - `table`  — `request_results` table via the async store; survives
 *     restarts, shared across instances. The status endpoint + idempotency
 *     replay then read the same row, so the two features compose.
 *
 * `rate-limit.ts` is **not** an idempotency layer. Do not modify it as
 * part of this work.
 * @see TASK-middleware-global-idempotency-replay-for-re-fired-requests.md
 * @see epic-middleware-request-lifecycle.md
 */

import type { AsyncStore, } from "../async/store";
import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import { createMemoryBackend, type IdempotencyBackendApi, } from "./idempotency-memory";
import { createTableBackend, redactKeyForLog, } from "./idempotency-table";
import { filterReplayHeaders, makeKey, } from "./idempotency-utils";
import { isValidRequestId, } from "./request-id";

/**
 * Module-scoped logger, fetched lazily on the first call. We use a
 * plain `getLogger()` (not `.child()`) so that test code can register
 * additional transports via `setGlobalLogger()` / `addTransport()` and
 * observe warn-log emissions from `recordResponse`'s failure path.
 * `getLogger()` may throw when no transport is registered (e.g. in
 * tests with no logging backend); swallow that.
 * @returns
 */
function getLog() {
  // Fetch fresh each call so that `setGlobalLogger()` updates in tests
  // are picked up. Caching here would lock the logger to whichever
  // was registered at first call, breaking downstream tests that
  // install a capturing transport.
  try {
    return getLogger();
  } catch {
    return null;
  }
}

/** Header that bypasses the idempotency cache when set to "1". */
export const IDEMPOTENCY_BYPASS_HEADER = "x-idempotency-bypass";

/** */
export type IdempotencyBackend = "memory" | "table";

/** */
export interface IdempotencyConfig {
  /** Backend selector. Default: `"memory"`. */
  backend?: IdempotencyBackend;
  /** TTL for cached responses in ms. Default: 24h. */
  ttlMs?: number;
  /** Async store for the table backend. Ignored when `backend === "memory"`. */
  asyncStore?: AsyncStore;
  /** Enable the middleware. When false, beforeHandle is a pass-through. Default: true. */
  enabled?: boolean;
  /** Honor the X-Idempotency-Bypass header. Default: true. */
  bypassHeader?: boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches messages.idempotencyExpiryHours default

/**
 * Build the idempotency beforeHandle for Elysia.
 *
 * Usage:
 *   .guard({ beforeHandle: idempotent({ backend: "table", asyncStore, }), },
 *     (app,) => app.post("/api/...", handler,),)
 * @param config - Backend selection + TTL + store binding.
 */
export function idempotent(config: IdempotencyConfig = {},): IdempotencyBeforeHandle {
  const cfg: Required<Pick<IdempotencyConfig, "backend" | "ttlMs" | "enabled" | "bypassHeader">> = {
    backend: config.backend ?? "memory",
    ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
    enabled: config.enabled ?? true,
    bypassHeader: config.bypassHeader ?? true,
  };
  const backend: IdempotencyBackendApi = cfg.backend === "table"
    ? createTableBackend(cfg.ttlMs, requireAsyncStore(config, "table",),)
    : createMemoryBackend(cfg.ttlMs,);

  return {
    backend: cfg.backend,
    ttlMs: cfg.ttlMs,
    beforeHandle(ctx: IdempotencyCtx,): Response | undefined {
      if (!cfg.enabled) { return undefined; } // disabled ⇒ pass-through
      if (cfg.bypassHeader && ctx.request.headers.get(IDEMPOTENCY_BYPASS_HEADER,) === "1") {
        return undefined; // client asked to bypass the cache
      }
      // Only mutating methods are idempotent. GET/HEAD/OPTIONS always run.
      const method = ctx.request.method.toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return undefined;
      }
      const requestId = ctx.requestId ?? ctx.request.headers.get("x-request-id",);
      if (!requestId) { return undefined; } // no id ⇒ not idempotent
      if (!isValidRequestId(requestId,)) { return undefined; }

      const route = ctx.route ?? "?";
      const userId = ctx.userId ?? null;
      const meta = { method, route, userId, };
      const key = makeKey(method, route, requestId, userId,);
      const existing = backend.get(key,);
      if (existing?.inFlight) {
        return jsonError({
          message: "Re-fired request still in flight",
          status: HttpStatus.Conflict,
          code: ErrorCode.Conflict,
        },);
      }
      if (existing && existing.completedAt !== null) {
        // Replay verbatim: status + headers + body. Whitelist the headers we
        // copy (skip Set-Cookie — a replay must NOT mint a new session).
        const replayHeaders = filterReplayHeaders(existing.headers,);
        return new Response(existing.body, {
          status: existing.status,
          headers: replayHeaders,
        },);
      }
      // First time on this key — reserve the slot. The handler will call
      // `recordResponse` (or the Elysia afterHandle hook) to capture the
      // actual response.
      backend.markInFlight(key, meta,);
      return undefined;
    },
    /**
     * Record a completed response into the cache. Called from a route
     * `afterHandle` after the handler runs successfully.
     * @param args
     * @param args.method
     * @param args.route
     * @param args.requestId
     * @param args.userId
     * @param args.response
     */
    recordResponse(
      args: { method: string; route: string; requestId: string; userId?: string | null; response: Response },
    ): void {
      const method = args.method.toUpperCase();
      const route = args.route;
      const userId = args.userId ?? null;
      const meta = { method, route, userId, };
      const key = makeKey(method, route, args.requestId, userId,);
      // Streaming responses (SSE) never end: cloning + reading their body
      // would pin the tee buffer and hold the slot forever. Streams are not
      // replayable — release the slot without caching.
      // BUG-bug-idempotency-record-response-hangs-on-sse-streams.
      if (args.response.headers.get("content-type",)?.includes("text/event-stream",)) {
        backend.release(key, meta,);
        return;
      }
      // Clone before reading the body so the original response (sent to the
      // client) is not consumed. `.text()` locks the stream.
      //
      // This is fire-and-forget: the Elysia afterHandle has already
      // returned by the time `.text()` settles. If `.text()` rejects
      // (stream locked, OOM, body already consumed by upstream) the
      // in-flight slot would remain forever — subsequent same-key
      // requests would 409 indefinitely. The `.catch` performs
      // `release()` so the slot is freed; the next request runs
      // instead of permanently hitting the in-flight conflict.
      const snapshot = args.response.clone();
      void snapshot.text().then((body,) => {
        const headers: Record<string, string> = {};
        snapshot.headers.forEach((value, name,) => {
          headers[name] = value;
        },);
        backend.recordResponse(key, meta, {
          status: snapshot.status,
          headers,
          body,
          startedAt: Date.now(),
        },);
      },).catch((error,) => {
        backend.release(key, meta,);
        getLog()?.warn("idempotency.record_response.failed", {
          module: "idempotency",
          methodRoute: redactKeyForLog(key,),
          error: error instanceof Error ? error.message : String(error,),
        },);
      },);
    },
    /**
     * Release an in-flight slot without caching (non-2xx completion).
     * @param args
     * @param args.method
     * @param args.route
     * @param args.requestId
     * @param args.userId
     */
    release(args: { method: string; route: string; requestId: string; userId?: string | null },): void {
      const method = args.method.toUpperCase();
      const route = args.route;
      const userId = args.userId ?? null;
      const meta = { method, route, userId, };
      backend.release(makeKey(method, route, args.requestId, userId,), meta,);
    },
    /** Test seam: clear all in-flight + completed entries. */
    clear(): void {
      backend.clear();
    },
  };
}

/**
 * Type guard for the async store argument. Selecting `backend: "table"`
 * without an `asyncStore` was the previous silent fallback to in-memory
 * behaviour (BUG-bug-idempotency-table-backend-accepted-but-never-
 * implemented); the guard now surfaces the misconfiguration as a
 * fail-fast error so production deployments can not silently lose
 * restart resilience.
 * @param config
 * @param backend
 */
function requireAsyncStore(config: IdempotencyConfig, backend: "table",): AsyncStore {
  if (!config.asyncStore) {
    throw new Error(
      `idempotent({ backend: "${backend}" }) requires an asyncStore; ` +
        `pass \`createAsyncStore(database)\` from src/async/.`,
    );
  }
  return config.asyncStore;
}

/** Minimal Elysia ctx shape consumed by the idempotency beforeHandle. */
export interface IdempotencyCtx {
  request: Request;
  /** Route pattern (e.g. `/api/chats/:id/messages`). Set by Elysia via `request.route`. */
  route?: string;
  /** Pre-resolved request id from the request-id middleware. */
  requestId?: string;
  /**
   * Resolved user id from the auth derive. Null/undefined when unauthenticated
   * (the auth derive sets `userId: null` on failed auth). Used to scope the
   * idempotency cache key so two users sharing an X-Request-Id cannot replay
   * each other's cached responses.
   */
  userId?: string | null;
}

/** Returned factory — the `beforeHandle` is the Elysia hook; the rest are helpers. */
export interface IdempotencyBeforeHandle {
  readonly backend: IdempotencyBackend;
  readonly ttlMs: number;
  beforeHandle(ctx: IdempotencyCtx,): Response | undefined;
  recordResponse(args: {
    method: string;
    route: string;
    requestId: string;
    userId?: string | null;
    response: Response;
  },): void;
  release(args: { method: string; route: string; requestId: string; userId?: string | null },): void;
  clear(): void;
}
