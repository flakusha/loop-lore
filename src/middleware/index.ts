// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Middleware barrel — exports types, auth, response policies.
 */

export { adminViewGuard, } from "./admin-gate";
export { authenticate, extractBearerToken, resetSoloUserCache, } from "./auth";
export { DynamicResponsePolicy, } from "./dynamic-response";
export type { DynamicApplyOptions, } from "./dynamic-response";
export { createHandleResolver, } from "./handle-resolver";
export type { HandleResolver, } from "./handle-resolver";
export { idempotent, } from "./idempotency";
export type { IdempotencyBackend, IdempotencyBeforeHandle, IdempotencyConfig, IdempotencyCtx, } from "./idempotency";
export { requirePermission, } from "./permissions";
export type { PermissionCtx, RequirePermissionOpts, } from "./permissions";
export { applyRequestId, isValidRequestId, resolveRequestId, } from "./request-id";
export type {} from "./request-id";
export { normalizeHeaderKey, ResponseHeaderPolicy, } from "./response-headers";
export type { ApplyOptions, RouteKind, } from "./response-headers";
export type { Middleware, RequestContext, RouteHandler, } from "./types";
