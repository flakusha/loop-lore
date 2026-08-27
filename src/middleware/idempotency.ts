// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 *
 * @see TASK-middleware-global-idempotency-replay-for-re-fired-requests.md
 * @see epic-middleware-request-lifecycle.md
 */

import type { AsyncStore, } from "../async/store";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import { isValidRequestId, } from "./request-id";

/** Replay entry kept by the in-memory backend. */
interface InMemoryEntry {
  status: number;
  headers: Record<string, string>;
  body: string;
  inFlight: boolean;
  startedAt: number;
  completedAt: number | null;
}

export type IdempotencyBackend = "memory" | "table";

export interface IdempotencyConfig {
  /** Backend selector. Default: `"memory"`. */
  backend?: IdempotencyBackend;
  /** TTL for cached responses in ms. Default: 5 min. */
  ttlMs?: number;
  /** Async store for the table backend. Ignored when `backend === "memory"`. */
  asyncStore?: AsyncStore;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Composite key — distinct methods on the same route are distinct. */
function makeKey(method: string, routePattern: string, requestId: string,): string {
  return `${method.toUpperCase()} ${routePattern} ${requestId}`;
}

/**
 * Build the idempotency beforeHandle for Elysia.
 *
 * Usage:
 *   .guard({ beforeHandle: idempotent({ backend: "table", asyncStore, }), },
 *     (app,) => app.post("/api/...", handler,),)
 *
 * @param config - Backend selection + TTL + store binding.
 */
export function idempotent(config: IdempotencyConfig = {},): IdempotencyBeforeHandle {
  const cfg: Required<Pick<IdempotencyConfig, "backend" | "ttlMs">> = {
    backend: config.backend ?? "memory",
    ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
  };
  const cache = new Map<string, InMemoryEntry>();

  // ── Memory backend ───────────────────────────────────────
  const memory = {
    get(key: string,): InMemoryEntry | null {
      const entry = cache.get(key,);
      if (!entry) { return null; }
      // TTL expiry: drop silently so the next call is treated as fresh.
      if (entry.completedAt !== null && Date.now() - entry.completedAt > cfg.ttlMs) {
        cache.delete(key,);
        return null;
      }
      return entry;
    },
    put(key: string, entry: InMemoryEntry,): void {
      cache.set(key, entry,);
    },
    markInFlight(key: string,): InMemoryEntry {
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
  };

  return {
    backend: cfg.backend,
    ttlMs: cfg.ttlMs,
    async beforeHandle(ctx: IdempotencyCtx,): Promise<Response | undefined> {
      const requestId = ctx.requestId ?? ctx.request.headers.get("x-request-id",);
      if (!requestId) { return undefined; } // no id ⇒ not idempotent
      if (!isValidRequestId(requestId,)) { return undefined; }

      const key = makeKey(ctx.request.method, ctx.route ?? "?", requestId,);
      const existing = memory.get(key,);
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
      // `recordIdempotentResponse` (or the Elysia afterHandle hook) to
      // capture the actual response.
      memory.markInFlight(key,);
      return undefined;
    },
    /**
     * Record a completed response into the cache. Called from a route
     * `afterHandle` after the handler runs successfully.
     */
    recordResponse(args: { method: string; route: string; requestId: string; response: Response },): void {
      const key = makeKey(args.method, args.route, args.requestId,);
      void args.response.text().then((body,) => {
        const headers: Record<string, string> = {};
        args.response.headers.forEach((value, name,) => {
          headers[name] = value;
        },);
        cache.set(key, {
          status: args.response.status,
          headers,
          body,
          inFlight: false,
          startedAt: Date.now(),
          completedAt: Date.now(),
        },);
      },);
    },
    /** Test seam: clear all in-flight + completed entries. */
    clear(): void {
      cache.clear();
    },
  };
}

/** Drop headers that must NOT replay (cookies, hop-by-hop). */
function filterReplayHeaders(headers: Record<string, string>,): Record<string, string> {
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

/** Minimal Elysia ctx shape consumed by the idempotency beforeHandle. */
export interface IdempotencyCtx {
  request: Request;
  /** Route pattern (e.g. `/api/chats/:id/messages`). Set by Elysia via `request.route`. */
  route?: string;
  /** Pre-resolved request id from the request-id middleware. */
  requestId?: string;
}

/** Returned factory — the `beforeHandle` is the Elysia hook; the rest are helpers. */
export interface IdempotencyBeforeHandle {
  readonly backend: IdempotencyBackend;
  readonly ttlMs: number;
  beforeHandle(ctx: IdempotencyCtx,): Promise<Response | undefined>;
  recordResponse(args: { method: string; route: string; requestId: string; response: Response },): void;
  clear(): void;
}
