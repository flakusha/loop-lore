// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical API error handler.
 *
 * Wraps unknown errors into the `ErrorEnvelope` shape (slice 1: shape only).
 * Legacy `jsonError` wire output is untouched — migration lands later.
 */

import {
  ErrorCode,
  ForbiddenError,
  HttpStatus,
  type HttpStatusCode,
  NotFoundError,
} from "../routes/http-utils/status";
import type { ErrorEnvelope, } from "../validation/error-envelope";

/**
 * Map any thrown value to a canonical error `Response`.
 * @param err thrown value (Error or unknown)
 * @param requestId correlation id echoed back in the envelope body
 * @returns a JSON `Response` whose body matches the `ErrorEnvelope` schema
 */
export function errorHandler(err: unknown, requestId: string,): Response {
  let status: HttpStatusCode = HttpStatus.InternalServerError;
  let errorCode: ErrorCode = ErrorCode.ServerError;
  let message = "Internal server error";

  if (err instanceof NotFoundError) {
    status = HttpStatus.NotFound;
    errorCode = ErrorCode.NotFound;
    message = err.message;
  } else if (err instanceof ForbiddenError) {
    status = HttpStatus.Forbidden;
    errorCode = ErrorCode.Forbidden;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  const body: ErrorEnvelope = { error_code: errorCode, message, request_id: requestId, };
  return Response.json(body, { status, },);
}
