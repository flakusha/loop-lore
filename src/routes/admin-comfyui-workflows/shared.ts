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

/**
 * The license fence for a write: trimmed, with blank or absent values null.
 * TypeBox has narrowed the field to string | null; the open body schema still
 * hands handlers an `unknown`, so the trim happens once here.
 * @param value - Untrusted `license` value from the request body
 * @returns {string | null}
 */
export function licenseValue(value: unknown,): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The `params_reviewed` integer for a write, keeping an omitted value.
 * @param value - Untrusted `params_reviewed` value from the request body
 * @param current - Existing row value, used when the field is omitted
 * @returns {number}
 */
export function paramsReviewedValue(value: unknown, current: number,): number {
  if (value === undefined) { return current; }
  return value === true ? 1 : 0;
}
