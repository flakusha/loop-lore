/**
 * HTTP Response Utilities
 *
 * Status code constants, response helpers, and type shorthands
 * for consistent API response handling across all route handlers.
 *
 * @module http-utils
 */

import { safeJsonStringify } from "../utils";

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
  constructor(entity: string, id: string, options?: ErrorOptions) {
    super(`${entity} not found: ${id}`, options);
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
export function jsonResponse(data: unknown, status: HttpStatusCode = HttpStatus.OK): Response {
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
export function jsonPaginated(data: unknown[], total: number, page: number, pageSize: number): Response {
  return Response.json(
    {
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    } satisfies PaginatedResponse<unknown>,
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
export function jsonCreated(data?: unknown): Response {
  if (data === undefined) return new Response(null, { status: HttpStatus.Created });
  const result = safeJsonStringify(data);
  if (!result.ok) {
    return jsonError("Failed to serialize response", HttpStatus.InternalServerError);
  }
  return new Response(result.value, {
    status: HttpStatus.Created,
    headers: { "Content-Type": "application/json" },
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
    const obj: Record<string, unknown> = Object.fromEntries(params);
    return obj as T;
  } catch {
    return jsonError("Invalid request body", HttpStatus.BadRequest);
  }
}

/**
 * Extract pagination params from URLSearchParams.
 * Defaults: page=1, pageSize=50 (capped at 200).
 * Clamps to safe ranges: page >= 1, pageSize 1..200.
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawSize = Number(searchParams.get("pageSize") ?? "50");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(1, Math.floor(rawSize)), 200) : 50;
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
  const escaped = prefix.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const regex = new RegExp(`^${escaped}/([^/]+)(/.*)?$`);
  const match = regex.exec(pathname);
  return match ? match[1] : null;
}

// ── Body field helpers ───────────────────────────────────────

/** Cast body field as string | undefined */
export function str(body: Record<string, unknown>, key: string): string | undefined {
  return body[key] as string | undefined;
}

/** Cast body field as number | undefined */
export function num(body: Record<string, unknown>, key: string): number | undefined {
  return body[key] as number | undefined;
}
