// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { loadConfig, } from "../config/load";
import type { getDatabase, } from "../db/index";
import type { getLogger, } from "../logger";
import { DynamicResponsePolicy, ResponseHeaderPolicy, } from "../middleware";
import { generateNonce, } from "../middleware/csp-nonce";
import { dispatchPluginRoute, } from "../plugins";

/**
 * Wrap the Elysia app so EVERY outgoing response (routes, errors, static,
 * docs) passes through the dynamic-response and response-header policies.
 * Dynamic runs first (sets Content-Encoding/Vary); the header policy is
 * additive and only fills headers the route omitted.
 *
 * @param app - Built Elysia app (provides `app.fetch`).
 * @param config - Resolved config (supplies both policy config blocks).
 * @param logger - Logger for the dynamic-response policy.
 * @returns A fetch-style handler applying both policies in order.
 */
export function createRequestHandler(
  app: { fetch: (request: Request,) => Response | Promise<Response> },
  config: ReturnType<typeof loadConfig>,
  logger: ReturnType<typeof getLogger>,
): (request: Request,) => Promise<Response> {
  const headerPolicy = new ResponseHeaderPolicy(config.headers,);
  const dynamicPolicy = new DynamicResponsePolicy(config.dynamicResponse, logger,);

  return async (request: Request,): Promise<Response> => {
    // Generate a unique request ID for traceability
    const requestId = crypto.randomUUID();
    // Attach request ID to the cloned request so downstream handlers can read it
    const headers = new Headers(request.headers,);
    headers.set("x-request-id", requestId,);
    const taggedRequest = new Request(request, { headers, },);
    generateNonce(taggedRequest,);
    let response = await app.fetch(taggedRequest,);
    // Return the request ID in the response header
    response.headers.set("X-Request-Id", requestId,);
    response = await dynamicPolicy.apply({ request: taggedRequest, response, },);
    response = headerPolicy.apply({ request: taggedRequest, response, },);
    return response;
  };
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
