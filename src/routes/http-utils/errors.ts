// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import { ErrorCode, HttpStatus, type HttpStatusCode, } from "./status";
import type { ApiResponseMeta, JsonErrorOptions, } from "./types";

/**
 * Current API version injected into every response envelope.
 * Bump when introducing breaking changes and mounting a new `/api/vN/` surface.
 */
export const API_VERSION = "1" as const;

/** Shared meta block for all API responses. */
export const API_META: ApiResponseMeta = { api_version: API_VERSION, };

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BadRequest]: ErrorCode.BadRequest,
  [HttpStatus.Unauthorized]: ErrorCode.Unauthorized,
  [HttpStatus.Forbidden]: ErrorCode.Forbidden,
  [HttpStatus.NotFound]: ErrorCode.NotFound,
  [HttpStatus.Conflict]: ErrorCode.Conflict,
  [HttpStatus.UnprocessableEntity]: ErrorCode.ValidationError,
  [HttpStatus.TooManyRequests]: ErrorCode.TooManyRequests,
  [HttpStatus.InternalServerError]: ErrorCode.ServerError,
  [HttpStatus.NotImplemented]: ErrorCode.NotImplemented,
  [HttpStatus.ServiceUnavailable]: ErrorCode.ServiceUnavailable,
};

export function jsonError(message: string, status?: HttpStatusCode, code?: ErrorCode,): Response;
export function jsonError(options: JsonErrorOptions,): Response;
/** Positional form is legacy; when `t` is set the message is an i18n key. */
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

/**
 * 409 Conflict — well-formed request that resolves to no single target
 * (ambiguous identifier, optimistic-lock mismatch).
 */
export function conflictResponse(message: string,): Response {
  return jsonError({ message, status: HttpStatus.Conflict, code: ErrorCode.Conflict, },);
}

/** Extract userId from Elysia context, or a localized 401 Response. */
export function requireUserId(ctx: unknown,): string | Response {
  const userId = (ctx as any).userId as string | null;
  if (!userId) {
    return unauthorizedResponse((ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",);
  }

  return userId;
}
