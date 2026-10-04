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
import { getRun, listRuns, stats, } from "../../harness/query";
import type { HarnessResult, HarnessTaskType, } from "../../harness/types";
import { toDetail, toSummary, } from "../../harness/types";
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
  const known: readonly HarnessTaskType[] = [
    "chat",
    "auto-gen",
    "aux",
    "embeddings",
    "rerank",
    "memory",
    "workflow",
    "handoff",
    "sandbox",
    "harness",
    "eval",
    "other",
  ];
  return known.find((k,) => k === value);
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
  // Every endpoint is a permissive 200 (the payload is validated at build
  // time by the query module) plus the shared 403 from the guard above.
  const response = { 200: t.Any(), 403: ErrorResponse, } as const;
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
          response,
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
          response,
        },)
        .get(`${prefix}/harness/stats`, async () => jsonResponse(await stats(),), {
          response,
        },),);
}
