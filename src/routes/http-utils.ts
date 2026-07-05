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
  constructor(msg = "Forbidden", options?: ErrorOptions) {
    super(msg, options);
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
  return new Response(data === undefined ? null : JSON.stringify(data), {
    status: HttpStatus.Created,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

/**
 * Empty no-content response (204). No body.
 */
export function jsonNoContent(): Response {
  return new Response(null, { status: HttpStatus.NoContent });
}

// ── Shared route utilities ─────────────────────────────────────

/** "Method not allowed" shorthand */
export const BAD_METHOD = (): Response => jsonError("Method not allowed", HttpStatus.BadRequest);

/**
 * Parse request body: JSON or form-encoded.
 * Returns typed body on success, error Response on parse failure.
 */
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T | Response> {
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      return (await request.json()) as T;
    }
    // form-encoded (htmx default)
    const text = await request.text();
    const params = new URLSearchParams(text);
    const obj: Record<string, unknown> = {};
    for (const [key, val] of params) {
      obj[key] = val;
    }
    return obj as T;
  } catch {
    return jsonError("Invalid request body", HttpStatus.BadRequest);
  }
}

/**
 * Extract pagination params from URLSearchParams.
 * Defaults: page=1, pageSize=50 (capped at 200).
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? "50"), 200);
  return { page, pageSize };
}

/**
 * Extract a UUID from a pathname by prefix pattern.
 * Returns null if not found.
 *
 * @example
 *   extractIdFromPath("/api/chats/abc-123", "/api/chats")  // "abc-123"
 *   extractIdFromPath("/api/chats/abc-123/messages", "/api/chats")  // "abc-123"
 */
export function extractIdFromPath(pathname: string, prefix: string): string | null {
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([a-f0-9-]+)(/.*)?$`);
  const match = pathname.match(regex);
  return match ? match[1] : null;
}
