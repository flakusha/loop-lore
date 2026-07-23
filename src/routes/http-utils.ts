/**
 * HTTP Response Utilities
 *
 * Status code constants, response helpers, and type shorthands
 * for consistent API response handling across all route handlers.
 *
 * @module http-utils
 */

import type { TranslatorFn, } from "../i18n/types";
import { safeJsonStringify, } from "../utils";

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
  constructor(entity: string, id: string, options?: ErrorOptions,) {
    super(`${entity} not found: ${id}`, options,);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(msg = "Forbidden", options?: ErrorOptions,) {
    super(msg, options,);
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

export interface PaginatedResponse<T,> {
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
export function jsonResponse(data: unknown, status: HttpStatusCode = HttpStatus.OK,): Response {
  return Response.json(data, { status, },);
}

export interface JsonErrorOptions {
  message: string;
  status?: HttpStatusCode;
  code?: ErrorCode;
}

/**
 * JSON error response with optional machine-readable code.
 *
 * Accepts either positional args (legacy) or an options object.
 *
 * @example
 *   jsonError({ message: "Not found", status: HttpStatus.NotFound })
 *   jsonError("Not found", HttpStatus.NotFound)
 *   jsonError({ message: "Expired token", status: HttpStatus.Unauthorized, code: "UNAUTHORIZED" })
 */
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BadRequest]: ErrorCode.BadRequest,
  [HttpStatus.Unauthorized]: ErrorCode.Unauthorized,
  [HttpStatus.Forbidden]: ErrorCode.Forbidden,
  [HttpStatus.NotFound]: ErrorCode.NotFound,
  [HttpStatus.UnprocessableEntity]: ErrorCode.ValidationError,
  [HttpStatus.TooManyRequests]: ErrorCode.TooManyRequests,
  [HttpStatus.InternalServerError]: ErrorCode.ServerError,
  [HttpStatus.NotImplemented]: ErrorCode.NotImplemented,
};

export function jsonError(message: string, status?: HttpStatusCode, code?: ErrorCode,): Response;
export function jsonError(options: JsonErrorOptions,): Response;
export function jsonError(
  messageOrOptions: string | JsonErrorOptions,
  status: HttpStatusCode = HttpStatus.BadRequest,
  code?: ErrorCode,
): Response {
  const message = typeof messageOrOptions === "string" ? messageOrOptions : messageOrOptions.message;
  const resolvedStatus = typeof messageOrOptions === "string"
    ? status
    : (messageOrOptions.status ?? HttpStatus.BadRequest);
  const resolvedCode = (typeof messageOrOptions === "string" ? code : messageOrOptions.code) ??
    STATUS_TO_CODE[resolvedStatus];
  const body: ApiError = { error: message, code: resolvedCode, };
  return Response.json(body, { status: resolvedStatus, },);
}

/**
 * JSON validation error (422) with field-level detail.
 *
 * @example
 *   jsonValidationError([
 *     { field: "email", message: "Invalid format" },
 *   ])
 */
export function jsonValidationError(errors: ValidationError[], message = "Validation failed",): Response {
  return Response.json(
    { error: message, code: "VALIDATION_ERROR", details: errors, } satisfies ApiError & {
      details: ValidationError[];
    },
    { status: HttpStatus.UnprocessableEntity, },
  );
}

export interface JsonPaginatedOptions {
  data: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * JSON paginated list response.
 *
 * Accepts either positional args (legacy) or an options object.
 *
 * @example
 *   jsonPaginated({ data: items, total, page, pageSize })
 *   jsonPaginated(items, total, page, pageSize)
 */
export function jsonPaginated(data: unknown[], total: number, page: number, pageSize: number,): Response;
export function jsonPaginated(options: JsonPaginatedOptions,): Response;
export function jsonPaginated(
  dataOrOptions: unknown[] | JsonPaginatedOptions,
  total?: number,
  page?: number,
  pageSize?: number,
): Response {
  const { data, pagination, } = typeof dataOrOptions === "object" && !Array.isArray(dataOrOptions,)
    ? {
      data: dataOrOptions.data,
      pagination: {
        total: dataOrOptions.total,
        page: dataOrOptions.page,
        pageSize: dataOrOptions.pageSize,
        totalPages: dataOrOptions.pageSize > 0 ? Math.ceil(dataOrOptions.total / dataOrOptions.pageSize,) : 0,
      },
    }
    : {
      data: dataOrOptions,
      pagination: {
        total: total ?? 0,
        page: page ?? 1,
        pageSize: pageSize ?? 0,
        totalPages: pageSize && pageSize > 0 ? Math.ceil((total ?? 0) / pageSize,) : 0,
      },
    };
  return Response.json({ data, pagination, }, { status: HttpStatus.OK, },);
}

/**
 * Created response (201). Empty body when no payload.
 *
 * @example
 *   jsonCreated({ id: "new-entity" })
 *   jsonCreated()  // no body
 */
export function jsonCreated(data?: unknown,): Response {
  if (data === undefined) { return new Response(null, { status: HttpStatus.Created, },); }
  const result = safeJsonStringify(data,);
  if (!result.ok) {
    return jsonError({ message: "Failed to serialize response", status: HttpStatus.InternalServerError, },);
  }
  return new Response(result.value, {
    status: HttpStatus.Created,
    headers: { "Content-Type": "application/json", },
  },);
}

/**
 * Empty no-content response (204). No body.
 */
export function jsonNoContent(): Response {
  return new Response(null, { status: HttpStatus.NoContent, },);
}

// ── Shared route utilities ─────────────────────────────────────

/** "Method not allowed" shorthand */

/**
 * Parse request body: JSON or form-encoded.
 * Returns typed body on success, error Response on parse failure.
 */
export async function parseBody<T = Record<string, unknown>,>(request: Request,): Promise<T | Response> {
  const ct = request.headers.get("content-type",) ?? "";
  try {
    if (ct.includes("application/json",)) {
      return (await request.json()) as T;
    }
    // form-encoded (htmx default)
    const text = await request.text();
    const params = new URLSearchParams(text,);
    const obj: Record<string, unknown> = Object.fromEntries(params,);
    return obj as T;
  } catch {
    return jsonError({ message: "Invalid request body", status: HttpStatus.BadRequest, },);
  }
}

/**
 * Extract pagination params from URLSearchParams.
 * Defaults: page=1, pageSize=50 (capped at 200).
 * Clamps to safe ranges: page >= 1, pageSize 1..200.
 */
export function parsePagination(searchParams: URLSearchParams,): { page: number; pageSize: number } {
  const rawPage = Number(searchParams.get("page",) ?? "1",);
  const rawSize = Number(searchParams.get("pageSize",) ?? "50",);
  const page = Number.isFinite(rawPage,) && rawPage >= 1 ? Math.floor(rawPage,) : 1;
  const pageSize = Number.isFinite(rawSize,) ? Math.min(Math.max(1, Math.floor(rawSize,),), 200,) : 50;
  return { page, pageSize, };
}

// ── Body field helpers ───────────────────────────────────────

/** Cast body field as string | undefined */
export function str(body: Record<string, unknown>, key: string,): string | undefined {
  return body[key] as string | undefined;
}

/** Cast body field as number | undefined */
export function num(body: Record<string, unknown>, key: string,): number | undefined {
  return body[key] as number | undefined;
}
// ── Common error response factories ───────────────────────────

/** 404 Not Found with NOT_FOUND code. */
export function notFoundResponse(message?: string, t?: TranslatorFn,): Response {
  const msg = message ?? t?.("errors.notFound",) ?? "Not found";
  return jsonError({ message: msg, status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
}

/** 404 "Not found or not owner" — ownership check failure. */
export function notOwnerResponse(entity = "Resource", t?: TranslatorFn,): Response {
  return notFoundResponse(`${entity} ${t?.("errors.notFound",) ?? "not found or not owner"}`, t,);
}

/** 401 Unauthorized. */
export function unauthorizedResponse(message?: string, t?: TranslatorFn,): Response {
  const msg = message ?? t?.("errors.unauthorized",) ?? "Unauthorized";
  return jsonError({ message: msg, status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized, },);
}

/** 403 Forbidden. */
export function forbiddenResponse(message?: string, t?: TranslatorFn,): Response {
  const msg = message ?? t?.("errors.forbidden",) ?? "Forbidden";
  return jsonError({ message: msg, status: HttpStatus.Forbidden, code: ErrorCode.Forbidden, },);
}

/** 400 Bad Request with message. */
export function badRequestResponse(message: string,): Response {
  return jsonError({ message, status: HttpStatus.BadRequest, code: ErrorCode.BadRequest, },);
}
