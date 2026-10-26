// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { loadConfig, } from "../config/load";
import type { getDatabase, } from "../db/index";
import type { TranslatorFn, } from "../i18n/types";
import type { getLogger, } from "../logger";
import { DynamicResponsePolicy, ResponseHeaderPolicy, } from "../middleware";
import { generateNonce, } from "../middleware/csp-nonce";
import type { HandleResolver, } from "../middleware/handle-resolver";
import { createHandleResolver, } from "../middleware/handle-resolver";
import { applyRequestId, resolveRequestId, } from "../middleware/request-id";
import { dispatchPluginRoute, type PluginCaller, } from "../plugins";
import { applyDeprecationHeaders, } from "../routes/middleware/deprecation-headers";
import { governanceAfterHook, governanceBeforeHook, } from "../routes/v1/governance";

/**
 * Wrap the Elysia app so EVERY outgoing response (routes, errors, static,
 * docs) passes through the dynamic-response and response-header policies.
 * Dynamic runs first (sets Content-Encoding/Vary); the header policy is
 * additive and only fills headers the route omitted.
 *
 * Also emits one access log entry per response with:
 *   - requestId  (UUID; echoed as X-Request-Id)
 *   - method, path
 *   - status
 *   - durationMs
 *   - userId + handle (best-effort; populated by elysia-app.ts .derive
 *     via x-user-id request header)
 * @param app - Built Elysia app (provides `app.fetch`).
 * @param app.fetch
 * @param config - Resolved config (supplies both policy config blocks).
 * @param logger - Logger for the dynamic-response policy + access log.
 * @param database - Optional. When provided, enables username resolution
 *   for the access log (cheap, cached).
 * @returns A fetch-style handler applying policies + access log.
 */
export function createRequestHandler(
  app: { fetch: (request: Request,) => Response | Promise<Response> },
  config: ReturnType<typeof loadConfig>,
  logger: ReturnType<typeof getLogger>,
  database?: ReturnType<typeof getDatabase>,
): (request: Request,) => Promise<Response> {
  const headerPolicy = new ResponseHeaderPolicy(config.headers,);
  const dynamicPolicy = new DynamicResponsePolicy(config.dynamicResponse, logger,);
  const handleResolver = database ? createHandleResolver(database,) : null;
  return async (request: Request,): Promise<Response> => {
    const requestId = resolveRequestId(request.headers,);
    const startMs = performance.now();

    // Attach request ID + auth context to the cloned request so downstream
    // handlers (Elysia .derive, plugin dispatch) can read them.
    const headers = new Headers(request.headers,);
    applyRequestId(headers, requestId,);

    const taggedRequest = new Request(request, { headers, },);
    generateNonce(taggedRequest,);

    let response = await app.fetch(taggedRequest,);
    response.headers.set("X-Request-Id", requestId,);
    response = await dynamicPolicy.apply({ request: taggedRequest, response, },);
    response = headerPolicy.apply({ request: taggedRequest, response, },);

    void logAccess({
      logger,
      handleResolver,
      request: taggedRequest,
      response,
      requestId,
      startMs,
    },).catch((err,) => {
      // Access logging is best-effort; never let its rejection (e.g. the
      // handle resolver's cache miss path) surface as an unhandled rejection.
      logger.warn("access log failed", { error: String(err,), },);
    },);

    return response;
  };
}

interface LogAccessOpts {
  logger: ReturnType<typeof getLogger>;
  handleResolver: HandleResolver | null;
  request: Request;
  response: Response;
  requestId: string;
  startMs: number;
}

/**
 * @param opts
 */
async function logAccess(opts: LogAccessOpts,): Promise<void> {
  const { logger, handleResolver, request, response, requestId, startMs, } = opts;
  const url = new URL(request.url,);
  const userId = request.headers.get("x-user-id",);
  const handle = userId && handleResolver ? await handleResolver.resolve(userId,) : null;
  const durationMs = Math.round(performance.now() - startMs,);
  const severity = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";

  const entry = {
    module: "http",
    requestId,
    method: request.method,
    path: url.pathname,
    status: response.status,
    durationMs,
    userId,
    handle,
  };

  try {
    switch (severity) {
      case "error":
        logger.error("http access", undefined, entry,);
        break;
      case "warn":
        logger.warn("http access", entry,);
        break;
      default:
        logger.info("http access", entry,);
    }
  } catch {
    // Logger may be torn down during shutdown — fall back silently.
  }
}

/** */
export interface HandleApiRequestOpts {
  request: Request;
  database: ReturnType<typeof getDatabase>;
  config: ReturnType<typeof loadConfig>;
  /** Identity resolved by the Elysia auth derive. Omitted → anonymous, which
   *  is what an unauthenticated request produces anyway. */
  caller?: PluginCaller;
  /** Request-locale translator from the auth derive; localises 401/403 bodies. */
  t?: TranslatorFn;
  /** Governance-guard enable predicate. Defaults to the same E2E_SAFEGUARD
   *  env read the v1 barrel uses, so the plugin-dispatch fallback below
   *  rate-limits identically to barrel routes. */
  governanceEnabled?: () => boolean;
}

/** Deprecation envelope shared with the v1 barrel (routes/v1/index.ts). */
const FALLBACK_DEPRECATION = {
  enabled: () => process.env.API_V1_DEPRECATED === "1",
  deprecatedVersion: "1",
  successorVersion: "2",
  sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
};

/**
 * API request handler — dispatches to plugin routes.
 *
 * Both the direct dispatch and the /api/v1 strip-prefix fallback pass through
 * the SAME governance guard (per-user rate limit + request metrics) and
 * deprecation-header envelope as v1-barrel routes — the fallback used to be a
 * bare dispatch that shipped a deprecated-but-unannounced, unthrottled v1
 * surface (BUG-fix-api-apply-governance-deprecation-to-the-api-v1-legacy-fa).
 * @param root0 - options object
 * @param root0.request - incoming `Request` to dispatch
 * @param root0.caller - identity used to enforce plugin route `requiresAuth` / `permissions`
 * @param root0.t - translator used to localise plugin route denial bodies
 * @param root0.governanceEnabled - governance predicate; defaults to the barrel's env read
 * @returns `Response` from the matched plugin route (404 when no plugin matches).
 */
export async function handleApiRequest(
  { request, caller, t, governanceEnabled, }: HandleApiRequestOpts,
): Promise<Response> {
  const enabled = governanceEnabled ?? (() => process.env.E2E_SAFEGUARD !== "1");
  const govBefore = governanceBeforeHook(enabled,);
  const govAfter = governanceAfterHook(enabled,);

  const dispatch = async (dispatchRequest: Request,): Promise<Response | null> => {
    const gctx: Record<string, unknown> = {
      request: dispatchRequest,
      userId: caller?.userId ?? null,
    };

    const denial = govBefore(gctx,);
    if (denial) { return denial; }

    const result = await dispatchPluginRoute({ request: dispatchRequest, caller, t, },);
    if (!result) { return null; }

    govAfter({ ...gctx, response: result, },);
    return applyDeprecationHeaders(result, FALLBACK_DEPRECATION,);
  };

  let pluginResult = await dispatch(request,);
  if (pluginResult) { return pluginResult; }

  // Versioned fallback: the v1 barrel doesn't cover every route module yet.
  // Strip the /api/v1 prefix so legacy plugin routes still serve versioned
  // requests during the migration ("breaking changes never break clients").
  const url = new URL(request.url,);
  if (url.pathname.startsWith("/api/v1/",)) {
    const strippedUrl = new URL(url.pathname.slice("/api/v1".length,) + url.search, url,);
    const strippedRequest = new Request(strippedUrl, request,);
    pluginResult = await dispatch(strippedRequest,);
    if (pluginResult) { return pluginResult; }
  }

  return new Response("Not found", { status: 404, },);
}
