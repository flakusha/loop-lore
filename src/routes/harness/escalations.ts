// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness escalation audit queue API
 * (TASK-escalation-audit-queue-with-no-auto-approve): list the recorded
 * root-change requests and decide on them. Admin-gated like the rest of the
 * harness surface; the queue lives in the repo-access audit table, so a
 * disabled repo-access tier simply has nothing to decide on.
 *
 * Approving grants ONE later root change for that principal and target;
 * denying closes the request. No principal is ever auto-approved.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  HarnessEscalationDecisionResponse,
  HarnessEscalationsResponse,
} from "../../frontend/alpine/admin-harness-schema";
import {
  type EscalationDecision,
  listPendingEscalations,
  resolveEscalation,
} from "../../integrations/harness/repo-access";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/**
 * Record one admin decision on a recorded escalation request.
 * @param database - the database handle
 * @param id - the addressed request id
 * @param decision - the decision to apply
 * @param adminId - the deciding admin (from the session, never the body)
 * @returns the JSON response
 */
async function decide(
  database: Kysely<DB>,
  id: string,
  decision: EscalationDecision,
  adminId: string,
): Promise<ReturnType<typeof jsonResponse> | ReturnType<typeof jsonError>> {
  const result = await resolveEscalation(database, { id, decision, adminId, },);
  if (result.ok) { return jsonResponse({ ok: true, },); }

  return jsonError({
    message: result.message,
    status: result.code === "unknown_request" ? HttpStatus.NotFound : HttpStatus.Conflict,
    code: result.code === "unknown_request" ? ErrorCode.NotFound : ErrorCode.Conflict,
  },);
}

/**
 * Build the harness escalation queue route plugin.
 * @param opts - the database handle
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessEscalationRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api/v1",
) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;
  const params = { params: t.Object({ id: t.String({},), },), } as const;
  /** Shared approve/deny response contract — one source of truth. */
  const decisionResponse = {
    response: { 200: HarnessEscalationDecisionResponse, 404: ErrorResponse, 409: ErrorResponse, ...denied, },
  } as const;

  return new Elysia({ name: "harness-escalations", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .get(`${prefix}/harness/escalations`, async () => {
          return jsonResponse({ items: await listPendingEscalations(database,), },);
        }, {
          response: { 200: HarnessEscalationsResponse, ...denied, },
        },)
        .post(`${prefix}/harness/escalations/:id/approve`, (ctx,) => {
          const { id, } = ctx.params as { id: string };
          const principal = ctx as { userId?: string | null };

          return decide(database, id, "approve", principal.userId ?? "",);
        }, { ...params, ...decisionResponse, },)
        .post(`${prefix}/harness/escalations/:id/deny`, (ctx,) => {
          const { id, } = ctx.params as { id: string };
          const principal = ctx as { userId?: string | null };

          return decide(database, id, "deny", principal.userId ?? "",);
        }, { ...params, ...decisionResponse, },),);
}
