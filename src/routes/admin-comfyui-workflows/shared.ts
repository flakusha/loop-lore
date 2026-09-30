// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared plumbing for the admin ComfyUI workflow surface: the permission
 * guard, the logger, and the two error responses every handler needs.
 *
 * The guard is applied per sub-plugin rather than wrapped once around the
 * barrel so the guarantee does not depend on Elysia propagating a parent
 * instance's `beforeHandle` into a mounted plugin's routes.
 */
import { getLogger, type Logger, } from "../../logger";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";

/** Every endpoint on this surface is admin-only. */
export const workflowGuard = requirePermission("admin.settings",);

/**
 * @returns {Logger}
 */
export function log(): Logger {
  return getLogger().child({ module: "admin-comfyui-workflows", },);
}

/**
 * 404 for an id that is missing, or that exists under another modality — the
 * surface must never look like it can reach an LLM or image template row.
 * @param id
 * @returns {Response}
 */
export function workflowNotFound(id: string,): Response {
  return jsonError({
    message: `Workflow ${id} not found`,
    status: HttpStatus.NotFound,
    code: ErrorCode.NotFound,
  },);
}

/**
 * 400 carrying the whole ingest error list, so the operator fixes every
 * problem in one pass instead of one round trip per error.
 * @param errors
 * @returns {Response}
 */
export function workflowInvalid(errors: string[],): Response {
  return jsonError({
    message: errors.join("; ",),
    status: HttpStatus.BadRequest,
    code: ErrorCode.BadRequest,
  },);
}
