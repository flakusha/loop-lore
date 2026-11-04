// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness permission approval API (TASK-permission-approval-flow): list the
 * ACP permission asks parked for a human and resolve them. Admin-gated like
 * the rest of the harness surface; the queue lives on the composed runtime
 * (`getHarnessRuntime().permissions`), so a disabled/unbooted integration
 * reads 503 — the flow is inert, never auto-anything.
 *
 * Approve sends `allow_once`, deny sends `reject_once`; `allow_always`/
 * `reject_always` are deliberately not offered (no grant persistence).
 */
import { Elysia, t, } from "elysia";
import {
  HarnessPermissionDecisionResponse,
  HarnessPermissionsResponse,
} from "../../frontend/alpine/admin-harness-schema";
import type { PermissionDecision, } from "../../integrations/harness/permission-queue";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Error when the runtime (and with it the queue) is not composed. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/**
 * Map one queue decision Result to an HTTP response.
 * @param id - the addressed request id (echoed in failures)
 * @param decision - the human decision to apply
 * @returns the JSON response.
 */
function decide(
  id: string,
  decision: PermissionDecision,
): ReturnType<typeof jsonResponse> | ReturnType<typeof jsonError> {
  const queue = getHarnessRuntime()?.permissions;
  if (!queue) { return jsonError(NOT_COMPOSED,); }

  const result = queue.resolve({ id, decision, },);
  if (result.ok) { return jsonResponse({ ok: true, },); }

  return jsonError({
    message: result.message,
    status: result.code === "unknown_request" ? HttpStatus.NotFound : HttpStatus.ServiceUnavailable,
    code: result.code === "unknown_request" ? ErrorCode.NotFound : ErrorCode.ServiceUnavailable,
  },);
}

/**
 * Build the harness permission route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessPermissionRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;
  const params = { params: t.Object({ id: t.String({},), },), } as const;

  return new Elysia({ name: "harness-permissions", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .get(`${prefix}/harness/permissions`, async () => {
          const queue = getHarnessRuntime()?.permissions;
          if (!queue) { return jsonError(NOT_COMPOSED,); }

          return jsonResponse({ items: queue.listPending(), },);
        }, {
          response: { 200: HarnessPermissionsResponse, ...denied, },
        },)
        .post(`${prefix}/harness/permissions/:id/approve`, (ctx,) => {
          return decide((ctx.params as { id: string }).id, "approve",);
        }, {
          ...params,
          response: { 200: HarnessPermissionDecisionResponse, 404: ErrorResponse, 503: ErrorResponse, ...denied, },
        },)
        .post(`${prefix}/harness/permissions/:id/deny`, (ctx,) => {
          return decide((ctx.params as { id: string }).id, "deny",);
        }, {
          ...params,
          response: { 200: HarnessPermissionDecisionResponse, 404: ErrorResponse, 503: ErrorResponse, ...denied, },
        },),);
}
