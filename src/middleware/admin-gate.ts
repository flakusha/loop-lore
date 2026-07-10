/**
 * Admin gate middleware
 *
 * Short-circuits to 403 if userRole is not "admin".
 * Applied before admin-only routes in the compose pipeline.
 */
import type { Middleware } from "./types";
import { jsonError, HttpStatus, ErrorCode } from "../routes/http-utils";

export const requireAdmin: Middleware = async (_request, context, next) => {
  if (context.userRole !== "admin") {
    return jsonError({
      message: "Admin access required",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    });
  }
  return next();
};
