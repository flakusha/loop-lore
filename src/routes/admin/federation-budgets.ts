// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-peer performance budget editing and the per-class assignment matrix.
 *
 * The matrix is the operator's class -> ordered-peer preference list. It lives
 * in `system_config` (no new migration in this ticket) and is read back by the
 * router through `readAssignmentMatrix`, so an edit here changes what
 * `resolvePeerRoute` decides — which the integration test drives against the real
 * router rather than a copy of its logic.
 *
 * An absent or empty row means LOCAL-ONLY for that class, matching the router.
 */

import { Elysia, } from "elysia";
import { PEER_BUDGET_MODES, PEER_WORKLOAD_CLASSES, } from "../../db/enums";
import {
  readAssignmentMatrix,
  writeAssignmentMatrix,
} from "../../federation/peer-assignment-matrix";
import {
  listPerformanceBudgets,
} from "../../federation/performance-quota-store";
import {
  BudgetValidationError,
  clearPerformanceBudget,
  toPerformanceBudget,
  writePerformanceBudget,
} from "../../federation/performance-quota-write";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { AdminFederationBudgetBody, AdminFederationMatrixBody, } from "../../validation/schemas/admin-federation";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, withPermissionAuth, } from "../http-utils";
import {
  auditFederationChange,
  federationOffResponse,
  isBudgetMode,
  isWorkloadClass,
  notInEnumResponse,
} from "./federation-shared";
import type { AdminFederationRouteOpts, } from "./federation-types";

/** Map a budget write rejection onto its 400. */
function budgetRejection(error: BudgetValidationError,): Response {
  const status = error.reason === "unknown_peer" ? HttpStatus.NotFound : HttpStatus.BadRequest;
  return jsonError({ message: error.message, status, code: ErrorCode.BadRequest, data: { reason: error.reason, }, },);
}

/**
 * Budget + matrix endpoints, all gated on the existing `admin.system` permission.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function federationBudgetRoutes(opts: AdminFederationRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return new Elysia({ name: "admin-federation-budgets", },)
    .get(`${prefix}/admin/federation/budgets`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async () => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return jsonResponse({ budgets: await listPerformanceBudgets(db,), },);
      },);
    }, { response: { 200: SuccessResponse, 403: ErrorResponse, 503: ErrorResponse, }, },)
    .put(`${prefix}/admin/federation/budgets`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }

        if (!isWorkloadClass(ctx.body.workloadClass,)) {
          return notInEnumResponse("workloadClass", ctx.body.workloadClass, PEER_WORKLOAD_CLASSES,);
        }

        if (!isBudgetMode(ctx.body.mode,)) { return notInEnumResponse("mode", ctx.body.mode, PEER_BUDGET_MODES,); }

        const input = {
          origin: ctx.body.origin,
          workloadClass: ctx.body.workloadClass,
          mode: ctx.body.mode,
          maxConcurrency: ctx.body.maxConcurrency ?? null,
          maxQueueDepth: ctx.body.maxQueueDepth ?? null,
          requestsPerMinute: ctx.body.requestsPerMinute ?? null,
          tokensPerMinute: ctx.body.tokensPerMinute ?? null,
        };

        try {
          await writePerformanceBudget({ database: db, input, },);
        } catch (error) {
          if (error instanceof BudgetValidationError) { return budgetRejection(error,); }
          throw error;
        }

        const saved = toPerformanceBudget(input,);
        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.budget_updated",
          action: "budget_update",
          entityType: "federation_performance_budget",
          entityId: `${saved.origin}/${saved.workloadClass}`,
          message: `Performance budget set: ${saved.origin} ${saved.workloadClass} (${saved.mode})`,
          meta: { ...saved, },
        },);

        return jsonResponse({ budget: saved, },);
      },);
    }, {
      body: AdminFederationBudgetBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        503: ErrorResponse,
      },
    },)
    .delete(`${prefix}/admin/federation/budgets/:origin/:workloadClass`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        if (!isWorkloadClass(ctx.params.workloadClass,)) {
          return notInEnumResponse("workloadClass", ctx.params.workloadClass, PEER_WORKLOAD_CLASSES,);
        }

        const cleared = await clearPerformanceBudget({
          database: db,
          origin: ctx.params.origin,
          workloadClass: ctx.params.workloadClass,
        },);

        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.budget_cleared",
          action: "budget_clear",
          entityType: "federation_performance_budget",
          entityId: `${ctx.params.origin}/${ctx.params.workloadClass}`,
          message: `Performance budget cleared: ${ctx.params.origin} ${ctx.params.workloadClass}`,
          meta: { origin: ctx.params.origin, workloadClass: ctx.params.workloadClass, cleared, },
        },);

        return jsonResponse({ ok: true, cleared, },);
      },);
    }, { response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 503: ErrorResponse, }, },)
    .get(`${prefix}/admin/federation/matrix`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async () => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return jsonResponse({ matrix: await readAssignmentMatrix(db,), },);
      },);
    }, { response: { 200: SuccessResponse, 403: ErrorResponse, 503: ErrorResponse, }, },)
    .put(`${prefix}/admin/federation/matrix`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }

        const submitted = ctx.body.preferences ?? {};
        for (const [key, entries,] of Object.entries(submitted,)) {
          if (!isWorkloadClass(key,)) { return notInEnumResponse("preferences key", key, PEER_WORKLOAD_CLASSES,); }
          if (!Array.isArray(entries,)) {
            return jsonError({
              message: `preferences.${key} must be an array of origins`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        }

        // The router consumes `{ preferences }`, so the stored row is wrapped in
        // that envelope rather than being a bare class->origins map.
        await writeAssignmentMatrix({ database: db, matrix: { preferences: submitted as never, }, },);
        const matrix = await readAssignmentMatrix(db,);
        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.matrix_updated",
          action: "matrix_update",
          entityType: "system_config",
          entityId: "federation.assignment_matrix",
          message: "Federation assignment matrix updated",
          meta: { matrix, },
        },);

        return jsonResponse({ matrix, },);
      },);
    }, {
      body: AdminFederationMatrixBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 503: ErrorResponse, },
    },);
}
