/**
 * Admin gate middleware
 *
 * Short-circuits to 403 (API) or 302 (views) if userRole is not "admin" or "solo".
 *
 * Two exports:
 *   requireAdmin        — legacy pipeline middleware (RequestContext-based)
 *   adminViewGuard      — Elysia beforeHandle guard (reads ctx.userRole)
 */
import { UserRole, } from "../db/enums";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import type { Middleware, } from "./types";

/**
 * Check if user role has admin privileges.
 * Admin role OR solo mode user both have full access.
 */
export function isAdminRole(userRole: string | null | undefined,): boolean {
  return userRole === "admin" || userRole === UserRole.Solo;
}

/** Legacy pipeline middleware — checks context.userRole. */
export const requireAdmin: Middleware = async (_request, context, next,) => {
  if (!isAdminRole(context.userRole,)) {
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
  if (!isAdminRole(ctx.userRole,)) {
    return new Response(null, { status: 302, headers: { Location: "/", }, },);
  }
}
