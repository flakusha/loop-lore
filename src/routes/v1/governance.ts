// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * API governance surface (epic-api-rate-limiting, epic-api-telemetry).
 *
 * governanceGuard: cross-cutting hooks applied to every v1 route —
 * per-user rate limiting (policy chosen by route prefix) and request
 * metrics (status + latency) feeding the Prometheus export.
 * governanceEndpoints: GET /rate-limit/status (self, any user) and
 * GET /metrics (Prometheus exposition, admin-only).
 */
import { Elysia, } from "elysia";
import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import { policyForRoute, } from "../../api-governance/rate-limiting/policies";
import { metrics, } from "../../api-governance/telemetry/collector";
import { renderPrometheus, } from "../../api-governance/telemetry/prometheus";
import { can, } from "../../users/permissions";
import { ErrorCode, extractAuth, HttpStatus, jsonError, requireUserId, } from "../http-utils";

/** Collapse id-like path segments so labels stay low-cardinality. */
function normalizeRoute(pathname: string,): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id",)
    .replace(/\/\d+(?=\/|$)/g, "/:id",);
}

/** */
export function governanceGuard(opts: { enabled?: () => boolean } = {},) {
  const enabled = opts.enabled ?? (() => true);
  return new Elysia({ name: "v1-governance-guard", },)
    .derive(() => ({ __governanceStart: Date.now(), }))
    .onBeforeHandle((ctx: any,) => {
      if (!enabled()) { return; }
      const userId = ctx.userId as string | undefined;
      if (!userId) { return; } // unauthenticated abuse is stopped at the auth endpoints' own limiters
      const url = new URL(ctx.request.url,);
      const policy = policyForRoute(url.pathname,);
      const verdict = governanceRateLimiter.consume(`${userId}:${policy.name}`, policy,);
      if (!verdict.allowed) {
        // Count the 429 exactly once here and flag the request so the
        // onAfterHandle telemetry hook skips it (Elysia runs onAfterHandle
        // for beforeHandle-returned responses too).
        (ctx as Record<string, unknown>).__governanceRateLimited = true;
        metrics.recordRequest(
          normalizeRoute(url.pathname,),
          HttpStatus.TooManyRequests,
          Date.now() - (ctx.__governanceStart as number),
        );
        const body = jsonError("Rate limit exceeded", HttpStatus.TooManyRequests, ErrorCode.TooManyRequests,);
        const headers = new Headers(body.headers,);
        headers.set("x-ratelimit-hit", "1",);
        headers.set("ratelimit-limit", String(verdict.limit,),);
        headers.set("ratelimit-remaining", "0",);
        const retryAfterSec = Math.max(1, Math.ceil(verdict.retryAfterSec ?? policy.windowMs / 1000,),);
        headers.set("ratelimit-reset", String(retryAfterSec,),);
        headers.set("retry-after", String(retryAfterSec,),);
        return new Response(body.body, { status: body.status, headers, },);
      }
    },)
    .onAfterHandle((ctx: any,) => {
      if (!enabled()) { return ctx.response as unknown; }
      const url = new URL(ctx.request.url,);
      const response = ctx.response as unknown;
      if ((ctx as Record<string, unknown>).__governanceRateLimited === true) {
        // Already counted by the 429 branch in onBeforeHandle — counting
        // again would double-report rate-limited traffic.
        return response;
      }
      const status = response instanceof Response ? response.status : HttpStatus.OK;
      metrics.recordRequest(normalizeRoute(url.pathname,), status, Date.now() - (ctx.__governanceStart as number),);
      return response;
    },)
    // Promote derive + hooks onto the mounting instance - Elysia keeps plugin
    // hooks local to the plugin's own routes unless scoped explicitly.
    .as("scoped",);
}

/** */
export function governanceEndpoints(prefix = "/api/v1",) {
  return (
    new Elysia({ name: "v1-governance", },)
      .get(
        `${prefix}/rate-limit/status`,
        (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const url = new URL(ctx.request.url,);
          // ?path= can be attacker-shaped ('?path=://'); a malformed value
          // must degrade to the request path, never 500 the endpoint.
          let target: URL;
          try {
            target = new URL(url.searchParams.get("path",) ?? url.pathname, url.origin,);
          } catch {
            target = url;
          }
          const policy = policyForRoute(target.pathname,);
          const verdict = governanceRateLimiter.peek(`${userId}:${policy.name}`, policy,);
          return Response.json({
            policy: verdict.policy,
            limit: verdict.limit,
            remaining: verdict.remaining,
            windowSec: Math.round(policy.windowMs / 1000,),
          },);
        },
      )
      .get(
        `${prefix}/metrics`,
        (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          if (!can(userRole, "admin.system",)) {
            return jsonError("Admin access required", HttpStatus.Forbidden, ErrorCode.Forbidden,);
          }
          return new Response(renderPrometheus(metrics,), {
            headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", },
          },);
        },
      )
  );
}
