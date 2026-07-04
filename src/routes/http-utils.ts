/**
 * HTTP Response Utilities
 *
 * Status code constants, response helpers, and type shorthands
 * for consistent API response handling across all route handlers.
 *
 * @module http-utils
 */

// ── HTTP status code constants ────────────────────────────────

export const HttpStatus = {
  OK: 200,
  Created: 201,
  NoContent: 204,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  TooManyRequests: 429,
  UnprocessableEntity: 422,
  InternalServerError: 500,
  NotImplemented: 501,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

export const ErrorCode = {
  BadRequest: "BAD_REQUEST",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  ValidationError: "VALIDATION_ERROR",
  TooManyRequests: "TOO_MANY_REQUESTS",
  ServerError: "SERVER_ERROR",
  NotImplemented: "NOT_IMPLEMENTED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Typed service errors ─────────────────────────────────────

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(msg = "Forbidden") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

// ── Response type shorthands ──────────────────────────────────

export interface ApiError {
  error: string;
  code?: ErrorCode;
  details?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ── Response helpers ──────────────────────────────────────────

/**
 * JSON success response.
 *
 * @example
 *   jsonResponse({ ok: true, id: "abc" })
 *   jsonResponse(user, HttpStatus.Created)
 */
export function jsonResponse<T>(data: T, status: HttpStatusCode = HttpStatus.OK): Response {
  return Response.json(data, { status });
}

/**
 * JSON error response with optional machine-readable code.
 *
 * @example
 *   jsonError("Not found", HttpStatus.NotFound)
 *   jsonError("Expired token", HttpStatus.Unauthorized, "UNAUTHORIZED")
 */
export function jsonError(
  message: string,
  status: HttpStatusCode = HttpStatus.BadRequest,
  code?: ErrorCode,
): Response {
  const body: ApiError = { error: message };
  if (code) body.code = code;
  return Response.json(body, { status });
}

/**
 * JSON validation error (422) with field-level detail.
 *
 * @example
 *   jsonValidationError([
 *     { field: "email", message: "Invalid format" },
 *   ])
 */
export function jsonValidationError(errors: ValidationError[], message = "Validation failed"): Response {
  return Response.json(
    { error: message, code: "VALIDATION_ERROR", details: errors } satisfies ApiError & {
      details: ValidationError[];
    },
    { status: HttpStatus.UnprocessableEntity },
  );
}

/**
 * JSON paginated list response.
 *
 * @example
 *   jsonPaginated(items, total, page, pageSize)
 */
export function jsonPaginated<T>(data: T[], total: number, page: number, pageSize: number): Response {
  return Response.json(
    {
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    } satisfies PaginatedResponse<T>,
    { status: HttpStatus.OK },
  );
}

/**
 * Created response (201). Empty body when no payload.
 *
 * @example
 *   jsonCreated({ id: "new-entity" })
 *   jsonCreated()  // no body
 */
export function jsonCreated<T>(data?: T): Response {
  return new Response(data !== undefined ? JSON.stringify(data) : null, {
    status: HttpStatus.Created,
    headers: data !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

/**
 * Empty no-content response (204). No body.
 */
export function jsonNoContent(): Response {
  return new Response(null, { status: HttpStatus.NoContent });
}
