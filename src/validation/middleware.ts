/**
 * Elysia validation & error middleware.
 *
 * Provides `onValidationError` — an `onError` handler for Elysia apps
 * that formats validation errors per the envelope spec:
 *   { error, code: "VALIDATION_ERROR", details: [{ field, message }] }
 *
 * Also catches NotFoundError / ForbiddenError from service layer
 * and maps them to 404 / 403 with the correct code.
 *
 * Usage:
 *   app.onError(onValidationError)
 *
 * @module validation/middleware
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NotFoundError, ForbiddenError } from "../routes/http-utils";

/**
 * Elysia `onError` handler that standardises validation and service-layer error responses.
 *
 * Register on the root app:
 *   app.onError(({ code, error, set }) => onValidationError(code, error, set))
 *
 * Cannot be used via `.use()` — Elysia scopes onError per-plugin instance
 * and validation errors from child routes don't bubble up to parent plugins.
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
      const errors = err.validator.Errors(err.value);
      for (const e of errors) {
        const field = (e.path ?? "").replace(/^\//, "");
        if (field && e.message) {
          details.push({ field, message: e.message });
        }
      }
    } catch {
      if (err.valueError?.path && err.valueError?.message) {
        details.push({
          field: (err.valueError.path as string).replace(/^\//, ""),
          message: err.valueError.message as string,
        });
      } else {
        details.push({ field: "body", message: err.message ?? "Validation failed" });
      }
    }

    return {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details:
        details.length > 0 ? details : [{ field: "body", message: err.message ?? "Validation failed" }],
    };
  }

  // ── Elysia "NOT_FOUND" for unmatched routes ─────────────
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { error: err.message ?? "Not found", code: "NOT_FOUND" };
  }

  // ── Elysia "PARSE" — body parse failure (e.g. multipart with no schema) ──
  if (code === "PARSE") {
    set.status = 400;
    return { error: err?.message ?? "Failed to parse request body", code: "PARSE_ERROR" };
  }

  // ── Service-layer errors ────────────────────────────────
  if (err instanceof NotFoundError) {
    set.status = 404;
    return { error: err.message, code: "NOT_FOUND" };
  }

  if (err instanceof ForbiddenError) {
    set.status = 403;
    return { error: err.message, code: "FORBIDDEN" };
  }

  // ── Unknown errors → 500 ────────────────────────────────
  set.status = 500;
  return { error: err?.message ?? "Internal server error", code: "SERVER_ERROR" };
}

/**
 * Helper to create a 401 response for guard handlers.
 */
export function unauthorized(message = "Unauthorized"): Response {
  return Response.json({ error: message, code: "UNAUTHORIZED" }, { status: 401 });
}

/**
 * Helper to create a 403 response for guard handlers.
 */
export function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message, code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Helper to create a 404 response for guard handlers.
 */
export function notFound(message = "Not found"): Response {
  return Response.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
}

/**
 * Compatibility re-export — deprecated. Use `onValidationError` directly.
 */
export const validationErrorHandler = onValidationError;
