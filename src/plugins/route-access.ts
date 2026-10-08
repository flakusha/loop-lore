// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin route access control.
 *
 * `RouteDefinition` declares `requiresAuth?: boolean` and
 * `permissions?: string[]` (see `./types`). Those fields were dead — nothing
 * in `src/` read them — because `dispatchPluginRoute` matched on path + method
 * only. The Elysia auth derive resolves identity but returns
 * `{userId: null, userRole: null}` on failure instead of rejecting, so a plugin
 * route could never be closed off by its own declaration.
 *
 * This module makes the declared contract load-bearing. A route declaring
 * *neither* field stays public — that is the behaviour of every plugin route
 * today and it does not change.
 *
 * ## SOLO MODE: THESE CHECKS ARE NO-OPS IN THE DEFAULT DEPLOYMENT
 *
 * `auth.required` defaults to **false** (see `src/config/load/safety.ts`).
 * In that mode `authenticate` auto-authenticates *every* request as a single
 * super-user with role `solo`, and `DEFAULT_PERMISSIONS.solo` is `["*"]`.
 * Therefore in solo mode:
 *
 *   - `requiresAuth: true` never denies — `caller.userId` is always non-null;
 *   - `permissions: [...]` never denies — `solo` holds every permission.
 *
 * A plugin author writing `requiresAuth: true` in a solo deployment gets
 * false assurance: the declaration is honest about *intent* but restricts
 * nothing. This is a deliberate non-change — treating `solo` as anonymous
 * would break the single-user UX — so instead the loader emits ONE aggregated
 * boot-time warning when an enabled route declares access fields while
 * `auth.required` is false. See `warnIfAccessFieldsAreInert` in ./loader.
 *
 * These checks answer "may this request reach the handler at all?". They do
 * NOT answer "may this caller see this row?" — that is the handler's job, and
 * the identity it needs is delivered as `handler(request, caller)`.
 *
 * @module plugin-route-access
 */

import { getLogger, } from "../logger";
import { forbiddenResponse, unauthorizedResponse, } from "../routes/http-utils";
import type { TranslatorFn, } from "../i18n/types";
import { hasAll, } from "../users/permissions";
import type { PluginCaller, RouteDefinition, } from "./types";

export type { PluginCaller, } from "./types";

/** Options for {@link checkRouteAccess}. */
export interface RouteAccessOpts {
  route: RouteDefinition;
  request: Request;
  /** Identity of the caller. Omitted means anonymous. */
  caller?: PluginCaller;
  /**
   * Request-locale translator. Passed straight to `unauthorizedResponse` /
   * `forbiddenResponse` so the 401/403 body is localised exactly like every
   * other route's — no new i18n path, just the same helper argument that
   * `src/routes/blog/*` passes from `ctx.t`.
   */
  t?: TranslatorFn;
}

/**
 * Enforce `requiresAuth` and `permissions` for a matched plugin route.
 * @param opts - the matched route plus the caller's resolved identity
 * @param opts.route - matched route definition
 * @param opts.request - incoming `Request`
 * @param opts.caller - caller identity (omitted means anonymous)
 * @param opts.t - translator used to localise the denial body
 * @returns The denial `Response` (401/403), or `null` when the call is allowed.
 */
export function checkRouteAccess(opts: RouteAccessOpts,): Response | null {
  const { route, caller, t, } = opts;
  const userId = caller?.userId ?? null;
  const userRole = caller?.userRole ?? null;

  if (route.requiresAuth === true && userId === null) {
    auditDenial("unauthenticated", opts,);
    // `undefined` message => the helper resolves `errors.unauthorized` via `t`.
    return unauthorizedResponse(undefined, t,);
  }

  // `permissions` is all-or-nothing: hasAll() is the repo's existing check
  // against the role → permission matrix in src/users/permissions.ts.
  if (route.permissions?.length && !hasAll(userRole, route.permissions,)) {
    auditDenial("forbidden", opts,);
    return forbiddenResponse(undefined, t,);
  }

  return null;
}

/**
 * Best-effort security audit log. An uninitialised logger (boot, unit tests)
 * must never turn a denial into a crash — the denial itself still stands.
 * @param reason - `unauthenticated` or `forbidden`
 * @param opts - the denied route plus the caller's resolved identity
 * @param opts.route - matched route definition
 * @param opts.request - incoming `Request`
 * @param opts.caller - caller identity (omitted means anonymous)
 */
function auditDenial(reason: string, { route, request, caller, }: RouteAccessOpts,): void {
  try {
    getLogger().warn("plugin route denied", {
      module: "authz",
      reason,
      path: route.path,
      method: route.method,
      requiredPermissions: route.permissions ?? [],
      userId: caller?.userId ?? null,
      userRole: caller?.userRole ?? null,
      requestId: request.headers.get("x-request-id",),
    },);
  } catch {
    // Logger not initialised — swallow.
  }
}
