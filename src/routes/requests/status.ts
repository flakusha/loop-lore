// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request status endpoint — `GET /api/requests/:id/status`.
 *
 * Surfaces the lifecycle of an async request tracked by the
 * `request_results` table. The frontend uses this to poll while a long
 * request is in flight; the idempotency layer uses the same table to
 * replay completed responses.
 *
 * Response shape:
 *   {
 *     requestId, status,             // "pending" | "in_progress" | "complete" | "failed" | "expired"
 *     method, routePattern, startedAt, completedAt,
 *     progress: {...} | null,
 *     response: { status, headers, body } | null,
 *     error: string | null,
 *   }
 *
 * Authorization: only the owning user (or an admin) may read a request's
 * status. Anonymous requests return 404 — not 401, to avoid leaking the
 * existence of an id.
 * @see TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md
 * @see epic-middleware-request-lifecycle.md
 */

import { Elysia, t, } from "elysia";
import { readOffloadedBody, } from "../../async/offload";
import type { AsyncStore, } from "../../async/store";
import { isValidRequestId, } from "../../middleware/request-id";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Minimal ctx shape consumed by the status handler. */
export interface RequestStatusCtx {
  /** Route params, validated by Elysia. */
  params: { id: string };
  /** Populated by the auth derive in elysia-app.ts. */
  userId?: string | null;
  /** Populated by the auth derive; admins may read any request's status. */
  userRole?: string | null;
}

/**
 * Build the `/api/requests` Elysia sub-app.
 * @param deps
 * @param deps.asyncStore
 * @param prefix
 */
export function requestStatusRoutes(deps: { asyncStore: AsyncStore }, prefix = "/api",) {
  return new Elysia({ name: "request-status", },)
    .get(
      `${prefix}/requests/:id/status`,
      async (ctx: RequestStatusCtx,) => {
        const id = ctx.params.id;
        if (!isValidRequestId(id,)) {
          return jsonError({
            message: "Invalid request id",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
        const row = await deps.asyncStore.read(id,);
        if (!row) {
          return jsonError({
            message: "Not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        // Ownership: BUG-bug-request-status-endpoint-fail-open-when-row-userid-is-nul.
        // Previous `if (row.userId !== null) { … }` skipped the check entirely
        // for anonymous rows, letting any caller who knew the id read the row.
        // Fix: anonymous rows are visible ONLY to admins; everyone else
        // gets 404 (same as missing row, so existence is not leaked).
        const callerId = ctx.userId ?? null;
        const isAdmin = ctx.userRole === "admin";
        const ownsRow = callerId !== null && callerId === row.userId;
        if (!ownsRow && !isAdmin) {
          return jsonError({ message: "Not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
        }

        // Resolve offloaded body if the row is no longer inlined.
        let body = row.responseBody;
        if (body === null && row.offloadPath !== null) {
          body = readOffloadedBody(row.offloadPath,);
        }
        const responsePayload = row.responseStatus !== null
          ? { status: row.responseStatus, headers: row.responseHeaders ?? {}, body, }
          : null;
        return jsonResponse({
          requestId: row.id,
          status: row.status,
          method: row.method,
          routePattern: row.routePattern,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          progress: row.progress,
          response: responsePayload,
          error: row.error,
        },);
      },
      {
        params: t.Object({
          id: t.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$", },),
        },),
        response: {
          200: t.Any(),
          400: t.Any(),
          404: t.Any(),
        },
      },
    );
}
