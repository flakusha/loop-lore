// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec-log read API.
 *
 * Three endpoints, all admin-only: the log carries branch names, error text
 * and process ids, so it is not public data. No write endpoint — the log is
 * append-only from inside the process (`harness/exec-log.ts`), never by HTTP.
 */
import { Elysia, t, } from "elysia";
import {
  HarnessRunDetailSchema,
  HarnessRunsResponse,
  HarnessStatsSchema,
} from "../../frontend/alpine/admin-harness-schema";
import { getRun, listRuns, stats, } from "../../harness/query";
import type { HarnessResult, HarnessTaskType, } from "../../harness/types";
import { HARNESS_TASK_TYPES, toDetail, toSummary, } from "../../harness/types";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/**
 * Narrow an untrusted query string to the closed `HarnessTaskType` union.
 * @param value - the raw, untrusted `?taskType=` query value
 * @returns the matching task type, or undefined when it is absent/unknown.
 */
function asTaskType(value: unknown,): HarnessTaskType | undefined {
  if (typeof value !== "string") { return undefined; }
  // The exported list is the source of truth for the union; a second copy here
  // is a membership check that silently rots the day a task type is added.
  return HARNESS_TASK_TYPES.find((k,) => k === value);
}

/**
 * Narrow an untrusted query string to the closed `HarnessResult` union.
 * @param value - the raw, untrusted `?result=` query value
 * @returns the matching result, or undefined when it is absent/unknown.
 */
function asResult(value: unknown,): HarnessResult | undefined {
  if (typeof value !== "string") { return undefined; }
  const known: readonly HarnessResult[] = ["ok", "error", "timeout", "cancelled",];
  return known.find((k,) => k === value);
}

/**
 * Build the harness route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the admin
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  // The 200 bodies are the schemas the web client already decodes with, imported
  // from there so the declared output and the `parseOr` input cannot drift. That
  // module is a leaf (it imports nothing but typebox), so this edge cannot cycle
  // back into the server.
  const denied = { 403: ErrorResponse, } as const;
  return new Elysia({ name: "harness", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .get(`${prefix}/harness/runs`, async (ctx,) => {
          const q = ctx.query as Record<string, string | undefined>;
          const limit = Number.parseInt(q.limit ?? "", 10,);
          const items = await listRuns(
            { taskType: asTaskType(q.taskType,), result: asResult(q.result,), },
            Number.isFinite(limit,) ? limit : undefined,
          );
          return jsonResponse({ items: items.map(toSummary,), },);
        }, {
          query: t.Object({
            limit: t.Optional(t.String({},),),
            taskType: t.Optional(t.String({},),),
            result: t.Optional(t.String({},),),
          },),
          response: { 200: HarnessRunsResponse, ...denied, },
        },)
        .get(`${prefix}/harness/runs/:runId`, async (ctx,) => {
          const { runId, } = ctx.params as { runId: string };
          const record = await getRun(runId,);
          if (record === null) {
            return jsonError({
              message: `Harness run "${runId}" not found`,
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }
          return jsonResponse(toDetail(record,),);
        }, {
          params: t.Object({ runId: t.String({},), },),
          response: { 200: HarnessRunDetailSchema, ...denied, },
        },)
        .get(`${prefix}/harness/stats`, async () => jsonResponse(await stats(),), {
          response: { 200: HarnessStatsSchema, ...denied, },
        },),);
}
