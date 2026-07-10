/**
 * Middleware barrel — exports types, auth, pipeline.
 */

export type { RequestContext, Middleware, RouteHandler } from "./types";
export { authenticate, extractBearerToken, resetSoloUserCache } from "./auth";
export { compose, errorBoundary, emptyContext } from "./pipeline";
export type { Pipeline } from "./pipeline";
export { ResponseHeaderPolicy } from "./response-headers";
export type { RouteKind, ApplyOptions } from "./response-headers";
