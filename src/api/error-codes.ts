// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical error-code registry.
 *
 * Single list of every wire `ErrorCode` plus its HTTP status. Reuses
 * `ErrorCode`/`HttpStatus` from `src/routes/http-utils/status.ts` — no new
 * codes are introduced here.
 */

import { ErrorCode, HttpStatus, type HttpStatusCode, } from "../routes/http-utils/status";

export { ErrorCode, } from "../routes/http-utils/status";

/** Every canonical error code mapped to its HTTP status. */
export const CODE_TO_STATUS: Record<ErrorCode, HttpStatusCode> = {
  [ErrorCode.BadRequest]: HttpStatus.BadRequest,
  [ErrorCode.Unauthorized]: HttpStatus.Unauthorized,
  [ErrorCode.Forbidden]: HttpStatus.Forbidden,
  [ErrorCode.NotFound]: HttpStatus.NotFound,
  [ErrorCode.ValidationError]: HttpStatus.UnprocessableEntity,
  [ErrorCode.StaleChatKey]: HttpStatus.BadRequest,
  [ErrorCode.TooManyRequests]: HttpStatus.TooManyRequests,
  [ErrorCode.ServerError]: HttpStatus.InternalServerError,
  [ErrorCode.Conflict]: HttpStatus.Conflict,
  [ErrorCode.NotImplemented]: HttpStatus.NotImplemented,
  [ErrorCode.ServiceUnavailable]: HttpStatus.ServiceUnavailable,
  [ErrorCode.ParseError]: HttpStatus.BadRequest,
  [ErrorCode.Gone]: HttpStatus.Gone,
  [ErrorCode.BadGateway]: HttpStatus.BadGateway,
  [ErrorCode.GatewayTimeout]: HttpStatus.GatewayTimeout,
  [ErrorCode.InsufficientStorage]: HttpStatus.InsufficientStorage,
  [ErrorCode.QuotaExceeded]: HttpStatus.TooManyRequests,
  [ErrorCode.StorageUnavailable]: HttpStatus.ServiceUnavailable,
};
