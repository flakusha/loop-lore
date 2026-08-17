// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin gate middleware
 *
 * Short-circuits to 403 (API) or 302 (views) if userRole is not "admin" or "solo".
 *
 * Two exports:
 *   requireAdmin        — legacy pipeline middleware (RequestContext-based)
 *   adminViewGuard      — Elysia beforeHandle guard (reads ctx.userRole)
 */
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import { can, } from "../users/permissions";
import type { Middleware, } from "./types";

/** Legacy pipeline middleware — checks context.userRole. */
export const requireAdmin: Middleware = async (_request, context, next,) => {
  if (!can(context.userRole, "admin.system",)) {
    return jsonError({
      message: "Admin access required",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    },);
  }
  return next();
};

/**
 * Elysia beforeHandle guard for view routes.
 * Returns 302 redirect to "/" on denial (non-disruptive UX for page nav).
 * Usage: .guard({ beforeHandle: adminViewGuard }, (app) => app.get("/views/admin", ...))
 *
 * Accepts any Elysia context shape — userRole is injected via .derive() in elysia-app.ts.
 */
export function adminViewGuard(ctx: any,): Response | undefined {
  if (!can(ctx.userRole, "admin.system",)) {
    return new Response(null, { status: 302, headers: { Location: "/", }, },);
  }
}
