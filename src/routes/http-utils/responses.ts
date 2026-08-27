// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import { safeJsonStringify, } from "../../utils";
import { ErrorCode, HttpStatus, type HttpStatusCode, } from "./status";
import type { ApiError, ApiResponseMeta, JsonErrorOptions, JsonPaginatedOptions, ValidationError, } from "./types";

/**
 * Current API version injected into every response envelope.
 * Bump when introducing breaking changes and mounting a new `/api/vN/` surface.
 */
export const API_VERSION = "1" as const;

/** Shared meta block for all API responses. */
const API_META: ApiResponseMeta = { api_version: API_VERSION, };

// ── Response helpers ──────────────────────────────────────────

/**
 * JSON success response.
 *
 * @example
 *   jsonResponse({ ok: true, id: "abc" })
 *   jsonResponse(user, HttpStatus.Created)
 */
export function jsonResponse(data: unknown, status: HttpStatusCode = HttpStatus.OK,): Response {
  // Merge meta into object responses (backward-compatible for property access).
  // Arrays and primitives pass through unchanged to preserve existing contracts.
  const body = (data !== null && typeof data === "object" && !Array.isArray(data,))
    ? { ...(data as Record<string, unknown>), meta: API_META, }
    : data;
  return Response.json(body, { status, },);
}

/**
 * JSON error response with optional machine-readable code.
 *
 * Accepts either positional args (legacy) or an options object.
 * When `t` is provided, message is treated as an i18n key.
 *
 * @example
 *   jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t })
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
  [HttpStatus.NotImplemented]: ErrorCode.NotImplemented,
  [HttpStatus.ServiceUnavailable]: ErrorCode.ServiceUnavailable,
};

export function jsonError(message: string, status?: HttpStatusCode, code?: ErrorCode,): Response;
export function jsonError(options: JsonErrorOptions,): Response;
export function jsonError(
  messageOrOptions: string | JsonErrorOptions,
  status: HttpStatusCode = HttpStatus.BadRequest,
  code?: ErrorCode,
): Response {
  const opts = typeof messageOrOptions === "string"
    ? { message: messageOrOptions, status, code, }
    : messageOrOptions;
  const message = opts.t ? opts.t(opts.message,) : opts.message;
  const resolvedStatus = opts.status ?? (typeof messageOrOptions === "string" ? status : HttpStatus.BadRequest);
  const resolvedCode = opts.code ?? STATUS_TO_CODE[resolvedStatus];
  const body = { error: message, code: resolvedCode, meta: API_META, };
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
    { error: message, code: "VALIDATION_ERROR", details: errors, meta: API_META, } satisfies ApiError & {
      details: ValidationError[];
    } & { meta: ApiResponseMeta },
    { status: HttpStatus.UnprocessableEntity, },
  );
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
  return Response.json({ data, pagination, meta: API_META, }, { status: HttpStatus.OK, },);
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
  const envelope = (data !== null && typeof data === "object" && !Array.isArray(data,))
    ? { ...(data as Record<string, unknown>), meta: API_META, }
    : { data, meta: API_META, };
  const result = safeJsonStringify(envelope,);
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

/** Extract userId from Elysia context or return a localized Unauthorized error response. */
export function requireUserId(ctx: unknown,): string | Response {
  const userId = (ctx as any).userId as string | null;
  if (!userId) {
    return unauthorizedResponse((ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",);
  }
  return userId;
}
