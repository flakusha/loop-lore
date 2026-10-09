// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonStringify, } from "../../utils";
import { API_META, jsonError, } from "./errors";
import { HttpStatus, type HttpStatusCode, } from "./status";
import type { ApiError, ApiResponseMeta, JsonPaginatedOptions, ValidationError, } from "./types";

// Error helpers live in `./errors`; re-exported here so existing importers of
// `http-utils/responses` keep resolving.
export {
  API_VERSION,
  badRequestResponse,
  conflictResponse,
  emotionJobNotFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
  jsonError,
  notFoundResponse,
  notOwnerResponse,
  requireUserId,
  unauthorizedResponse,
} from "./errors";

/**
 * JSON success response.
 * @param data
 * @param status
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
 * JSON validation error (422) with field-level detail.
 * @param errors
 * @param message
 */
export function jsonValidationError(errors: ValidationError[], message = "Validation failed",): Response {
  return Response.json(
    { error: message, code: "VALIDATION_ERROR", details: errors, meta: API_META, } satisfies ApiError & {
      details: ValidationError[];
    } & { meta: ApiResponseMeta },
    { status: HttpStatus.UnprocessableEntity, },
  );
}

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
 * @param data
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

/** Empty no-content response (204). No body. */
export function jsonNoContent(): Response {
  return new Response(null, { status: HttpStatus.NoContent, },);
}
