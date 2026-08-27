// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";

// ── Auth helpers ──────────────────────────────────────────────

/** Extract auth fields (userId, userRole) from Elysia context. */
export function extractAuth(ctx: unknown,): { userId: string | null; userRole: string | null } {
  return {
    userId: (ctx as any).userId as string | null,
    userRole: (ctx as any).userRole as string | null,
  };
}

// ── HTTP status code constants ────────────────────────────────

export const HttpStatus = {
  OK: 200,
  Created: 201,
  NoContent: 204,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  Gone: 410,
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
  Conflict: "CONFLICT",
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

/**
 * Create a translated error message.
 * If `t` is provided, translates the key; otherwise returns the key as-is.
 */
export function translateError(key: string, t?: TranslatorFn,): string {
  return t ? t(key,) : key;
}
