// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Central post-derive guard: closes the delegated-enforcement residual
// (derive-audit R1/R2 — fail-open owner_id===userId on nullable-owner rows).
// Unlisted routes fail closed (401); entries below trace to the audit allowlist.
import type { TranslatorFn, } from "../i18n/types";
import { registry, } from "../plugins";
import { normalizePluginRoutePath, } from "../plugins/registry-policy";
import { unauthorizedResponse, } from "../routes/http-utils";

export interface GuardIdentity {
  userId: string | null;
  userRole: string | null;
  t?: TranslatorFn | undefined;
}

interface AllowEntry {
  method: string;
  prefix: string;
}

const PUBLIC_ENTRIES: readonly AllowEntry[] = [
  { method: "POST", prefix: "/api/auth/login", },
  { method: "POST", prefix: "/api/v1/auth/login", },
  { method: "POST", prefix: "/api/auth/register", },
  { method: "POST", prefix: "/api/v1/auth/register", },
  { method: "POST", prefix: "/api/demo-login", },
  { method: "POST", prefix: "/api/v1/demo-login", },
  { method: "POST", prefix: "/api/auth/logout", },
  { method: "POST", prefix: "/api/v1/auth/logout", },
  { method: "GET", prefix: "/health/live", },
  { method: "GET", prefix: "/health/ready", },
  { method: "GET", prefix: "/api/health", },
  { method: "GET", prefix: "/api/v1/health", },
  { method: "GET", prefix: "/metrics", },
  { method: "POST", prefix: "/api/telemetry/event", },
  // Anonymous sink: rate-limited, no domain rows (audit R3).
  { method: "POST", prefix: "/api/v1/telemetry/event", },
  // Anonymous log sink: no domain writes (audit R3).
  { method: "POST", prefix: "/api/frontend/logs", },
  { method: "POST", prefix: "/api/v1/frontend/logs", },
  // Stateless pure-compute calculators: no DB, no identity.
  { method: "POST", prefix: "/api/battle/morale", },
  { method: "POST", prefix: "/api/v1/battle/morale", },
  { method: "POST", prefix: "/api/battle/npc", },
  { method: "POST", prefix: "/api/v1/battle/npc", },
  { method: "POST", prefix: "/api/battle/resolution", },
  { method: "POST", prefix: "/api/v1/battle/resolution", },
  { method: "POST", prefix: "/api/battle/social", },
  { method: "POST", prefix: "/api/v1/battle/social", },
  { method: "POST", prefix: "/api/battle/weather", },
  { method: "POST", prefix: "/api/v1/battle/weather", },
  // HMAC trust (not session): verified per-request inside the handler.
  { method: "POST", prefix: "/api/v1/integrations/webhooks/", },
  // Peer-credential trust: PSK proof / peer credential checked in-handler.
  { method: "POST", prefix: "/api/mesh-reserve", },
  { method: "POST", prefix: "/api/mesh-deliver", },
  { method: "POST", prefix: "/api/peer-work/run", },
  // Guest-read carve-out: GET-only, role='guest', shapes below.
  { method: "GET", prefix: "/api/auth/me", },
  { method: "GET", prefix: "/api/v1/auth/me", },
  { method: "GET", prefix: "/api/emoji", },
  { method: "GET", prefix: "/api/v1/emoji", },
  { method: "GET", prefix: "/api/i18n/locales", },
  { method: "GET", prefix: "/api/v1/i18n/locales", },
  { method: "GET", prefix: "/api/local-inference/manifest", },
  { method: "GET", prefix: "/api/v1/local-inference/manifest", },
  { method: "GET", prefix: "/api/local-inference/capability", },
  { method: "GET", prefix: "/api/v1/local-inference/capability", },
  { method: "GET", prefix: "/api/age-gate/status", },
  { method: "GET", prefix: "/api/v1/age-gate/status", },
  { method: "GET", prefix: "/.well-known/host-meta", },
  { method: "GET", prefix: "/.well-known/webfinger", },
  { method: "GET", prefix: "/.well-known/nodeinfo", },
  { method: "GET", prefix: "/nodeinfo/2.1", },
  { method: "GET", prefix: "/api/instance-state", },
  { method: "GET", prefix: "/.well-known/loop-lore/build-id", },
  { method: "GET", prefix: "/api/admin/build-id", },
];

const GUEST_READ_SHAPES: readonly (readonly string[])[] = [
  ["worlds",],
  ["worlds", ":id",],
  ["worlds", ":id", "locations",],
  ["worlds", ":id", "locations", ":id",],
  ["chats",],
  ["chats", ":id",],
  ["chats", ":id", "messages",],
  ["messages", ":id",],
  ["messages", ":id", "variants",],
  ["messages", ":id", "variant",],
  ["templates",],
  ["templates", ":id",],
  ["actors",],
  ["actors", ":id",],
];

/** Whether a stripped path matches one of the guest GET read shapes. */
function isGuestReadPath(stripped: string,): boolean {
  const segs = stripped.split("/",).filter((s,) => s.length > 0);
  return GUEST_READ_SHAPES.some((shape,) =>
    shape.length === segs.length && shape.every((part, i,) => part === ":id" || part === segs[i])
  );
}

function isNonApiGet(method: string, pathname: string,): boolean {
  if (method !== "GET") { return false; }
  if (pathname === "/" || pathname === "/chat" || pathname === "/register") { return true; }
  if (pathname.startsWith("/views/",)) { return true; }
  if (pathname.startsWith("/api/views/",)) { return true; }
  if (!pathname.startsWith("/api",)) { return true; }
  return false;
}

/**
 * Plugin-declared open routes: a plugin route with neither `requiresAuth`
 * nor `permissions` is public by contract (`route-access.ts`), and the
 * guard must honor that — otherwise a fail-closed check at the app layer
 * would 401 routes the registry deliberately leaves open. Requires-auth
 * and permission-gated plugin routes are NOT allowlisted: they fall
 * through to the guarded default (401 for null userId), matching the
 * dispatch-time denial without running the handler.
 *
 * Paths are normalized exactly like dispatch (`loader.ts`) and matched
 * on the version-stripped form, since the v1 hop strips `/api/v1` before
 * dispatch: an `/api/v1/...` request matches a plugin route registered
 * with or without the plugin's own `/api` prefix.
 */
function isOpenPluginRoute(method: string, pathname: string,): boolean {
  const normalized = normalizePluginRoutePath(pathname,);
  const stripped = pathname.startsWith("/api/v1/",)
    ? [
      normalized,
      normalizePluginRoutePath(pathname.slice("/api/v1".length,),),
      normalizePluginRoutePath(`/api${pathname.slice("/api/v1".length,)}`,),
    ]
    : [normalized,];

  for (const route of registry.getEnabledRoutes()) {
    if (route.method !== method) { continue; }

    const routePath = normalizePluginRoutePath(route.path,);
    if (!stripped.includes(routePath,)) { continue; }

    if (route.requiresAuth === true) { return false; }

    if ((route.permissions?.length ?? 0) > 0) { return false; }

    return true;
  }

  return false;
}

export function isAllowlisted(method: string, pathname: string, userRole: string | null,): boolean {
  const upper = method.toUpperCase();

  for (const entry of PUBLIC_ENTRIES) {
    if (upper !== entry.method) { continue; }

    const p = entry.prefix;
    const base = p.endsWith("/",) ? p.slice(0, -1,) : p;
    if (pathname === base || pathname.startsWith(base + "/",)) { return true; }
  }

  if (upper === "OPTIONS" || upper === "HEAD") { return true; }

  if (isNonApiGet(upper, pathname,)) { return true; }

  if (isOpenPluginRoute(upper, pathname,)) { return true; }

  if (userRole === "guest" && upper === "GET") {
    const stripped = pathname.startsWith("/api/v1/",)
      ? pathname.slice("/api/v1".length,)
      : pathname.startsWith("/api/",)
      ? pathname.slice("/api".length,)
      : null;

    if (stripped !== null && isGuestReadPath(stripped,)) { return true; }
  }

  return false;
}

export function requireAuthGuard(ctx: {
  request: Request;
  userId?: string | null;
  userRole?: string | null;
  set: { status?: number | string };
  t?: TranslatorFn | undefined;
},): Response | undefined {
  const { request, set, } = ctx;

  const userId = ctx.userId ?? null;
  if (userId) { return undefined; }

  const url = new URL(request.url,);
  if (isAllowlisted(request.method, url.pathname, ctx.userRole ?? null,)) { return undefined; }

  set.status = 401;

  return unauthorizedResponse(undefined, ctx.t,);
}
