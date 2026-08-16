// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Middleware barrel — exports types, auth, pipeline.
 */

export { adminViewGuard, requireAdmin, } from "./admin-gate";
export { authenticate, extractBearerToken, resetSoloUserCache, } from "./auth";
export { DynamicResponsePolicy, } from "./dynamic-response";
export type { DynamicApplyOptions, } from "./dynamic-response";
export { compose, emptyContext, errorBoundary, } from "./pipeline";
export type { Pipeline, } from "./pipeline";
export { normalizeHeaderKey, ResponseHeaderPolicy, } from "./response-headers";
export type { ApplyOptions, RouteKind, } from "./response-headers";
export type { Middleware, RequestContext, RouteHandler, } from "./types";
