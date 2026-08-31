// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Permission middleware.
 *
 * Elysia `beforeHandle` factory that checks a role permission and
 * returns a localized 403 on denial. Denials are auto-logged with
 * {userId, handle, requestId, permission, method, path} for security
 * forensics.
 *
 * Replaces the ~7-line boilerplate previously inlined in every admin
 * route:
 *
 *   if (!can(ctx.userRole, "admin.settings",)) {
 *     return jsonError({ message: ..., status: 403, code: "FORBIDDEN", },);
 *   }
 *
 * Usage:
 *   .guard({ beforeHandle: requirePermission("admin.settings",), }, (app) => ...)
 */

import type { Logger, } from "../logger";
import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import { can, type Permission, } from "../users/permissions";

/** Minimal Elysia ctx shape consumed by requirePermission. */
export interface PermissionCtx {
  request: Request;
  userId?: string | null;
  userRole?: string | null;
  /** Pre-resolved i18n translator (i18n middleware). */
  t?: (key: string, vars?: Record<string, string | number>,) => string;
  /** Request ID stamped by the request logger. */
  requestId?: string;
}

/** Resolved user handle for audit logging — fetched lazily on denial. */
type HandleResolver = (userId: string,) => Promise<string | null>;

/** Optional cache to avoid per-request DB lookups for the same user. */
class HandleCache {
  private readonly cache = new Map<string, string | null>();
  /**
   * @param resolve
   */
  constructor(private readonly resolve: HandleResolver,) {}
  /**
   * @param userId
   */
  async get(userId: string,): Promise<string | null> {
    const hit = this.cache.get(userId,);
    if (hit !== undefined) { return hit; }
    const handle = await this.resolve(userId,);
    // Cap to prevent unbounded growth across long-running processes.
    if (this.cache.size >= 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) { this.cache.delete(firstKey,); }
    }
    this.cache.set(userId, handle,);
    return handle;
  }
}

/** */
export interface RequirePermissionOpts {
  /** Logger for denial audit. Defaults to global logger. */
  logger?: Logger;
  /** Resolves userId → handle for audit log. When omitted, only userId is logged. */
  resolveHandle?: HandleResolver;
}

/**
 * Create an Elysia `beforeHandle` that allows the request iff
 * `can(ctx.userRole, permission)` is true. Returns a localized 403
 * on denial and emits a security audit log entry.
 * @param permission - Permission string (see users/permissions.ts).
 * @param opts - Logger + handle resolver overrides.
 */
export function requirePermission(
  permission: Permission,
  opts: RequirePermissionOpts = {},
): (ctx: PermissionCtx,) => Promise<Response | undefined> {
  const log = opts.logger;
  const handleCache = opts.resolveHandle ? new HandleCache(opts.resolveHandle,) : null;

  return async (ctx: PermissionCtx,): Promise<Response | undefined> => {
    if (can(ctx.userRole, permission,)) {
      return;
    }

    const userId = ctx.userId ?? null;
    const handle = userId && handleCache ? await handleCache.get(userId,) : null;
    const requestId = ctx.requestId ?? ctx.request.headers.get("x-request-id",) ?? null;
    const url = new URL(ctx.request.url,);

    const auditEntry = {
      module: "authz",
      permission,
      userId,
      handle,
      role: ctx.userRole ?? null,
      method: ctx.request.method,
      path: url.pathname,
      requestId,
    };
    try {
      (log ?? getLogger()).warn("Permission denied", auditEntry,);
    } catch {
      // Logger not initialized yet — fall back to console for boot-time denials.
      console.warn("Permission denied", auditEntry,);
    }

    return jsonError({
      message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    },);
  };
}
