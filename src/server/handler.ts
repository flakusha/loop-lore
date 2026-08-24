import type { loadConfig, } from "../config/load";
import type { getDatabase, } from "../db/index";
import type { getLogger, } from "../logger";
import { DynamicResponsePolicy, ResponseHeaderPolicy, } from "../middleware";
import { generateNonce, } from "../middleware/csp-nonce";
import type { HandleResolver, } from "../middleware/handle-resolver";
import { createHandleResolver, } from "../middleware/handle-resolver";
import { dispatchPluginRoute, } from "../plugins";

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
 *
 * @param app - Built Elysia app (provides `app.fetch`).
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
    const requestId = crypto.randomUUID();
    const startMs = performance.now();

    // Attach request ID + auth context to the cloned request so downstream
    // handlers (Elysia .derive, plugin dispatch) can read them.
    const headers = new Headers(request.headers,);
    headers.set("x-request-id", requestId,);
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

export interface HandleApiRequestOpts {
  request: Request;
  database: ReturnType<typeof getDatabase>;
  config: ReturnType<typeof loadConfig>;
}

/**
 * API request handler — dispatches to plugin routes.
 * All other API routes are handled by Elysia plugins.
 */
export async function handleApiRequest({ request, }: HandleApiRequestOpts,): Promise<Response> {
  let pluginResult = await dispatchPluginRoute(request,);
  if (pluginResult) { return pluginResult; }

  // Versioned fallback: the v1 barrel doesn't cover every route module yet.
  // Strip the /api/v1 prefix so legacy plugin routes still serve versioned
  // requests during the migration ("breaking changes never break clients").
  const url = new URL(request.url,);
  if (url.pathname.startsWith("/api/v1/",)) {
    const strippedUrl = new URL(url.pathname.slice("/api/v1".length,) + url.search, url,);
    const strippedRequest = new Request(strippedUrl, request,);
    pluginResult = await dispatchPluginRoute(strippedRequest,);
    if (pluginResult) { return pluginResult; }
  }

  return new Response("Not found", { status: 404, },);
}
