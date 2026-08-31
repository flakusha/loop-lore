// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Elysia validation & error middleware.
 …
 18:
 */

import { getLogger, } from "../logger";
import { ForbiddenError, NotFoundError, } from "../routes/http-utils";

/**
 * Elysia `onError` handler that standardises validation and service-layer error responses.
 *
 * Register on the root app:
 *   app.onError(({ code, error, set }) => onValidationError(code, error, set))
 *
 * Cannot be used via `.use()` — Elysia scopes onError per-plugin instance
 * and validation errors from child routes don't bubble up to parent plugins.
 * @param code
 * @param error
 * @param set
 * @param set.status
 */
export function onValidationError(
  code:
    | number
    | "VALIDATION"
    | "NOT_FOUND"
    | "PARSE"
    | "INTERNAL_SERVER_ERROR"
    | "INVALID_COOKIE_SIGNATURE"
    | "INVALID_FILE_TYPE"
    | "UNKNOWN",
  error: Error,
  set: { status?: number },
): Record<string, unknown> {
  const err = error as any;

  // ── Elysia validation error (schema mismatch) ───────────
  if (code === "VALIDATION") {
    set.status = 422;

    const details: { field: string; message: string }[] = [];

    try {
      const errors = err.validator.Errors(err.value,);
      for (const e of errors) {
        const field = (e.path ?? "").replace(/^\//, "",);
        if (field && e.message) {
          details.push({ field, message: e.message, },);
        }
      }
    } catch {
      if (err.valueError?.path && err.valueError?.message) {
        details.push({
          field: (err.valueError.path as string).replace(/^\//, "",),
          message: err.valueError.message as string,
        },);
      } else {
        details.push({ field: "body", message: err.message ?? "Validation failed", },);
      }
    }

    return {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: details.length > 0 ? details : [{ field: "body", message: err.message ?? "Validation failed", },],
    };
  }

  // ── Elysia "NOT_FOUND" for unmatched routes ─────────────
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { error: err.message ?? "Not found", code: "NOT_FOUND", };
  }

  // ── Elysia "PARSE" — body parse failure (e.g. multipart with no schema) ──
  if (code === "PARSE") {
    set.status = 400;
    return { error: err?.message ?? "Failed to parse request body", code: "PARSE_ERROR", };
  }

  // ── Service-layer errors ────────────────────────────────
  if (err instanceof NotFoundError) {
    set.status = 404;
    return { error: err.message, code: "NOT_FOUND", };
  }

  if (err instanceof ForbiddenError) {
    set.status = 403;
    return { error: err.message, code: "FORBIDDEN", };
  }

  // ── Unknown errors → 500 ────────────────────────────────
  // Never leak `err.message` to the client: SQL errors, file paths, and
  // stack frames can disclose schema, infrastructure topology, or secrets.
  // Log the full error server-side and return a generic envelope.
  try {
    getLogger().error(
      "Unhandled error in Elysia onError handler",
      error instanceof Error ? error : new Error(String(error,),),
      { code, },
    );
  } catch {
    // Logger not initialized — silently swallow; never let logging break
    // the error response.
  }
  set.status = 500;
  return { error: "Internal server error", code: "SERVER_ERROR", };
}

/**
 * Helper to create a 401 response for guard handlers.
 * @param message
 */
export function unauthorized(message = "Unauthorized",): Response {
  return Response.json({ error: message, code: "UNAUTHORIZED", }, { status: 401, },);
}

/**
 * Helper to create a 403 response for guard handlers.
 * @param message
 */
export function forbidden(message = "Forbidden",): Response {
  return Response.json({ error: message, code: "FORBIDDEN", }, { status: 403, },);
}

/**
 * Helper to create a 404 response for guard handlers.
 * @param message
 */
export function notFound(message = "Not found",): Response {
  return Response.json({ error: message, code: "NOT_FOUND", }, { status: 404, },);
}

/**
 * Compatibility re-export — deprecated. Use `onValidationError` directly.
 */
export const validationErrorHandler = onValidationError;
