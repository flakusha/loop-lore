// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { InsertObject, } from "kysely";
import type { Config, } from "../config/schema";
import { AUTH_DEFAULTS, } from "../config/sections/auth";
import type { Db, } from "../db";
import type { DB, } from "../db/schema";
import type { TranslatorFn, } from "../i18n/types";
import { getLogger, } from "../logger";
import { rateLimitResponse, } from "../routes/auth/request";
import { getClientIp, } from "../routes/auth/shared";
import { safeJsonStringify, } from "../utils";
import { createRateLimiter, } from "./rate-limit";
import { GUEST_READ_SHAPES, isGuestReadPath, stripApiVersion, } from "./require-auth-guard";

/**
 * Per-IP rate limiting + audit logging for the guest read tier
 * (epic-guest-access Phase 4).
 *
 * Reuses the shared in-memory sliding-window limiter
 * ({@link createRateLimiter}) with the auth routes' per-IP bucket-key policy
 * (`getClientIp`), configured from the auth section's `guestReadLimit` /
 * `guestReadWindowSec`. Only requests WITHOUT a userId whose derived role is
 * `guest` are gated, and only on GET paths matching the central guard's
 * `GUEST_READ_SHAPES` — registered users and every other route pass through
 * without touching the bucket Map. Wired in `src/elysia-app.ts` immediately
 * AFTER the central `requireAuthGuard` hook, so a guest read is 401-gated
 * before it consumes budget and a blocked read never reaches a handler.
 *
 * Every SERVED (non-429) guest read writes one `log_entries` audit row —
 * `event_type = "guest.read"`, `userRole=guest` + request id + route + target
 * id in meta, `user_id` stays null (the tier has no identity to invent).
 * Best-effort: an insert failure is logged and swallowed.
 *
 * Lifecycle: same single-process in-memory assumption as the auth-route
 * limiters (src/routes/auth/shared.ts:31-41) — per-process buckets, not a
 * shared store. Call {@link GuestReadLimiter.destroy} on shutdown/tests.
 */

/** Path segments of {@link GUEST_READ_SHAPES} that are literals, not `:id`. */
const SHAPE_LITERALS: ReadonlySet<string> = new Set(GUEST_READ_SHAPES.flat(),);

/**
 * @param stripped - version-stripped request path
 * @returns the trailing id segment of a guest read path, or null for a
 *   collection route (or a non-path)
 */
function targetIdOf(stripped: string | null,): string | null {
  if (stripped === null) { return null; }
  const segs = stripped.split("/",).filter((s,) => s.length > 0);
  const last = segs[segs.length - 1] ?? "";
  if (last === "" || SHAPE_LITERALS.has(last,)) { return null; }
  return last;
}

interface GuestReadAuditInfo {
  requestId: string | null;
  route: string;
  targetId: string | null;
  ip: string;
}

/**
 * Build the `log_entries` row for a served guest read. 429 rejections are
 * NOT audited: rows count reads actually served.
 * @param info
 * @returns the insert payload; `meta` falls back to null when serialization
 *   fails (never throws)
 */
function auditRowValues(info: GuestReadAuditInfo,): InsertObject<DB, "log_entries"> {
  const meta = safeJsonStringify({
    userRole: "guest",
    route: info.route,
    targetId: info.targetId,
    ip: info.ip,
  },);

  return {
    id: crypto.randomUUID(),
    level: 6, // INFO
    timestamp: Date.now(),
    time: new Date().toISOString(),
    message: `Guest read: ${info.route}`,
    module: "guest-read",
    // No invented identity: the guest tier has no user row.
    user_id: null,
    request_id: info.requestId,
    action: "read",
    event_type: "guest.read",
    meta: meta.ok ? meta.value : null,
  };
}

/**
 * Write one `log_entries` row for a served guest read. Never throws — an
 * insert failure is logged and swallowed so auditing cannot fail the read.
 * @param database
 * @param info
 */
async function recordGuestReadAudit(database: Db, info: GuestReadAuditInfo,): Promise<void> {
  try {
    await database.insertInto("log_entries",).values(auditRowValues(info,),).execute();
  } catch (error: unknown) {
    try {
      getLogger().child({ module: "guest-read", },).error(
        "Failed to write guest read audit row",
        error instanceof Error ? error : new Error(String(error,),),
      );
    } catch { /* logger not initialized */ }
  }
}

/** Minimal Elysia context slice the guest read guard reads. */
export interface GuestReadGuardCtx {
  request: Request;
  userId?: string | null;
  userRole?: string | null;
  /** Request id from the request-id derive; lands in the audit row. */
  requestId?: string;
  /** Bun server — connection-derived peer IP source (`server.requestIP`). */
  server?: {
    requestIP(request: Request,): { address: string } | null;
  } | null;
  set: { status?: number | string };
  t?: TranslatorFn | undefined;
}

/** The guard surface returned by {@link createGuestReadLimiter}. */
export interface GuestReadLimiter {
  /** Elysia `onBeforeHandle` hook: 429s over-budget guest reads. */
  guard: (ctx: GuestReadGuardCtx,) => Promise<Response | undefined>;
  /** Stop the prune timer and drop all buckets (tests, shutdown). */
  destroy: () => void;
}

/**
 * Build the guest read limiter and its guard hook.
 * @param deps
 * @param deps.config - resolved app config; reads `auth.guestReadLimit`,
 *   `auth.guestReadWindowSec` (AUTH_DEFAULTS when unset) and
 *   `server.trustProxy` (via {@link getClientIp}).
 * @param deps.database - database handle for the audit rows; reads are NOT
 *   audited when omitted/null.
 * @returns the guard hook plus a destroy handle for the underlying limiter
 */
export function createGuestReadLimiter(
  deps: { config: Config; database?: Db | null },
): GuestReadLimiter {
  const { config, database, } = deps;
  const limiter = createRateLimiter({
    windowMs: (config.auth.guestReadWindowSec ?? AUTH_DEFAULTS.guestReadWindowSec) * 1000,
    maxRequests: config.auth.guestReadLimit ?? AUTH_DEFAULTS.guestReadLimit,
  },);

  /**
   * @param ctx
   * @returns a 429 Response when the guest read is over budget, otherwise
   *   undefined to let the request proceed
   */
  async function guard(ctx: GuestReadGuardCtx,): Promise<Response | undefined> {
    if (ctx.userId) { return undefined; }
    if (ctx.userRole !== "guest") { return undefined; }
    if (ctx.request.method.toUpperCase() !== "GET") { return undefined; }
    const pathname = new URL(ctx.request.url,).pathname;
    const stripped = stripApiVersion(pathname,);
    if (stripped === null || !isGuestReadPath(stripped,)) { return undefined; }

    const peerIp = ctx.server?.requestIP(ctx.request,)?.address ?? null;
    const ip = getClientIp(ctx.request, config, peerIp,);
    const result = limiter.consume(`guest:${ip}`,);
    if (!result.allowed) {
      return rateLimitResponse({
        request: ctx.request,
        limit: result,
        t: ctx.t,
        fallbackMessage: "Too many requests",
      },);
    }

    if (database) {
      // Awaited so the row is durable when the response is handed over;
      // the writer is best-effort and never rejects.
      await recordGuestReadAudit(database, {
        requestId: ctx.requestId ?? null,
        route: pathname,
        targetId: targetIdOf(stripped,),
        ip,
      },);
    }

    return undefined;
  }

  return { guard, destroy: limiter.destroy, };
}
