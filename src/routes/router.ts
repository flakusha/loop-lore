/**
 * Route Router
 *
 * Single dispatch function matching URL patterns to route handlers.
 * Each route module exports a dispatch(request, context, database, config)
 * that returns Response on match, null to pass to next router.
 *
 * Wire into server.ts handleApiRequest() replacing the 501 stub.
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { Config } from "../config/schema";
import { jsonError, HttpStatus, ErrorCode } from "./http-utils";

export interface RouteDispatchParams {
  request: Request;
  context: RequestContext;
  database: Kysely<DB>;
  config: Config;
}

// Route module dispatch signature
export type RouteDispatch = (params: RouteDispatchParams) => Promise<Response | null>;

// Registered route modules — imported lazily via getter to avoid circular deps
const ROUTE_MODULES: RouteDispatch[] = [
  // Ordered by specificity (most specific first)
  /* P0 route modules will be added here as created */
];

/**
 * Register a route dispatch function.
 * Called at module import time by each route module.
 */
export function registerRoute(dispatch: RouteDispatch): void {
  ROUTE_MODULES.push(dispatch);
}

/**
 * Main API dispatch — iterates registered route modules.
 * Returns the first matching Response, or 501 if no module matched.
 */
export async function apiDispatch(params: RouteDispatchParams): Promise<Response> {
  for (const dispatch of ROUTE_MODULES) {
    const result = await dispatch(params);
    if (result !== null) return result;
  }

  return jsonError("Route not implemented", HttpStatus.NotImplemented, ErrorCode.NotImplemented);
}
