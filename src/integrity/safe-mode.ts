// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe-mode write gate. When safe mode is active, mutating HTTP methods get
 * 503; reads (GET/HEAD/OPTIONS) and the health probes continue to serve. The
 * gate is checked centrally in the request handler so every route — including
 * plugins — is covered without touching each one.
 */
import { HttpStatus, jsonError, } from "../routes/http-utils";
import { getIntegrityState, } from "./state";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE",],);

/** Whether this request must be rejected under safe mode. */
export function isWriteBlocked(method: string,): boolean {
  return getIntegrityState().safeMode && WRITE_METHODS.has(method.toUpperCase(),);
}

/** 503 response for a write rejected by safe mode. */
export function safeModeResponse(): Response {
  return jsonError({
    message:
      "Service in safe mode: writes disabled after integrity failure. Read endpoints remain available; an operator must acknowledge recovery.",
    status: HttpStatus.ServiceUnavailable,
  },);
}
