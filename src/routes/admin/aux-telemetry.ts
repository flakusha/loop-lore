// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin AUX Telemetry Endpoint
 *
 * GET /api/admin/telemetry/aux — recent AUX pipeline call events.
 * Returns the last N aux.call events with optional aggregation by task.
 */
import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Parsed aux.call telemetry row. */
interface AuxTelemetryRow {
  id: string;
  task: string;
  model: string | null;
  provider: string | null;
  latencyMs: number;
  success: boolean;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
  chatId: string | null;
  userId: string | null;
  createdAt: string;
}

/** Per-task aggregate stats. */
interface TaskAggregate {
  task: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * AUX telemetry admin routes.
 */
export function auxTelemetryRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return (
    new Elysia({ name: "admin-aux-telemetry", },)
      // ── Recent AUX telemetry events ──────────────────────
      .get(`${prefix}/admin/telemetry/aux`, async (ctx: any,) => {
        const { userRole, query, } = ctx;
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const limit = Math.min(
          Math.max(Number(query?.limit,) || DEFAULT_LIMIT, 1,),
          MAX_LIMIT,
        );
        const task = typeof query?.task === "string" ? query.task : undefined;

        // Fetch recent aux.call events
        const rows = await db
          .selectFrom("telemetry_events",)
          .select(["id", "event_data", "chat_id", "user_id", "created_at",],)
          .where("event_type", "=", "aux.call",)
          .orderBy("created_at", "desc",)
          .limit(limit,)
          .execute();

        // Parse event_data JSON into typed rows
        const events: AuxTelemetryRow[] = [];
        for (const row of rows) {
          const data = jsonParseOr<Record<string, unknown>>(row.event_data, {},);
          if (!data || typeof data !== "object") { continue; }

          const rowTask = typeof data.task === "string" ? data.task : "";
          // Optional task filter
          if (task && rowTask !== task) { continue; }

          events.push({
            id: row.id,
            task: rowTask,
            model: typeof data.model === "string" ? data.model : null,
            provider: typeof data.provider === "string" ? data.provider : null,
            latencyMs: Number(data.latencyMs,) || 0,
            success: Boolean(data.success,),
            promptTokens: Number(data.promptTokens,) || 0,
            completionTokens: Number(data.completionTokens,) || 0,
            error: typeof data.error === "string" ? data.error : null,
            chatId: row.chat_id,
            userId: row.user_id,
            createdAt: row.created_at,
          },);
        }

        // Aggregate by task
        const taskMap = new Map<string, TaskAggregate>();
        for (const ev of events) {
          let agg = taskMap.get(ev.task,);
          if (!agg) {
            agg = {
              task: ev.task,
              totalCalls: 0,
              successCount: 0,
              failureCount: 0,
              avgLatencyMs: 0,
              totalPromptTokens: 0,
              totalCompletionTokens: 0,
            };
            taskMap.set(ev.task, agg,);
          }
          agg.totalCalls++;
          if (ev.success) { agg.successCount++; }
          else { agg.failureCount++; }
          agg.totalPromptTokens += ev.promptTokens;
          agg.totalCompletionTokens += ev.completionTokens;
        }
        // Compute avg latency per task
        const taskTotals = new Map<string, { sum: number; count: number }>();
        for (const ev of events) {
          const t = taskTotals.get(ev.task,) ?? { sum: 0, count: 0, };
          t.sum += ev.latencyMs;
          t.count++;
          taskTotals.set(ev.task, t,);
        }
        for (const [taskName, agg,] of taskMap) {
          const totals = taskTotals.get(taskName,);
          agg.avgLatencyMs = totals ? Math.round(totals.sum / totals.count,) : 0;
        }

        return jsonResponse({
          events,
          aggregates: Array.from(taskMap.values(),),
          total: events.length,
        },);
      }, {
        response: {
          200: t.Object({
            events: t.Array(t.Object({
              id: t.String(),
              task: t.String(),
              model: t.Union([t.String(), t.Null(),],),
              provider: t.Union([t.String(), t.Null(),],),
              latencyMs: t.Number(),
              success: t.Boolean(),
              promptTokens: t.Number(),
              completionTokens: t.Number(),
              error: t.Union([t.String(), t.Null(),],),
              chatId: t.Union([t.String(), t.Null(),],),
              userId: t.Union([t.String(), t.Null(),],),
              createdAt: t.String(),
            },),),
            aggregates: t.Array(t.Object({
              task: t.String(),
              totalCalls: t.Number(),
              successCount: t.Number(),
              failureCount: t.Number(),
              avgLatencyMs: t.Number(),
              totalPromptTokens: t.Number(),
              totalCompletionTokens: t.Number(),
            },),),
            total: t.Number(),
          },),
          403: ErrorResponse,
        },
      },)
  );
}
