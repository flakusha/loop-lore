// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry Routes
 *
 * Frontend event ingestion plus admin analytics dashboard.
 * Two config gates:
 *   – frontend-telemetry-enabled  → POST /api/telemetry/event
 *   – telemetry-enabled           → GET  /api/telemetry/analytics/*
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../routes/http-utils";

import {
  isFrontendTelemetryEnabled,
  isTelemetryEnabled,
  record,
} from "../telemetry/service";
import { can, } from "../users/permissions";

import { ErrorResponse, SuccessResponse, TelemetryEventBody, } from "../validation/schemas";
import { purgeTelemetryEvents, } from "./telemetry-purge";

interface HandleOpts {
  database: Kysely<DB>;
}

export function telemetryRoutes({ database, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "telemetry", },)
    .post(`${prefix}/telemetry/event`, async (ctx: any,) => {
      if (!isFrontendTelemetryEnabled()) {
        return jsonResponse({ ok: true, dropped: "frontend telemetry disabled", },);
      }

      await record(database, {
        eventType: ctx.body.type,
        sessionId: ctx.body.sessionId,
        userId: ctx.body.userId,
        chatId: ctx.body.chatId,
        data: ctx.body.data ?? {},
      },);

      return jsonResponse({ ok: true, },);
    }, {
      body: TelemetryEventBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Record telemetry event",
        description: "Record a frontend telemetry event (requires telemetry to be enabled).",
        tags: ["Telemetry",],
      },
    },)
    .get(`${prefix}/telemetry/analytics/summary`, async (ctx: any,) => {
      if (!can(ctx.userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }
      if (!isTelemetryEnabled()) {
        return jsonError({
          message: ctx.t?.("telemetry.telemetryDisabled",) ?? "Telemetry is disabled",
          status: HttpStatus.NotFound,
        },);
      }

      const result = await database
        .selectFrom("telemetry_events",)
        .select((eb,) => [
          eb.fn.countAll<number>().as("total",),
          eb.fn.count<number>("id",).distinct().as("distinct_sessions",),
          eb.fn.count<number>("id",).distinct().as("distinct_users",),
        ])
        .executeTakeFirst();

      return jsonResponse(result ?? { total: 0, distinct_sessions: 0, distinct_users: 0, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get analytics summary",
        description: "Get a summary of telemetry analytics (total events, distinct sessions/users). Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },)
    .get(`${prefix}/telemetry/analytics/models`, async (ctx: any,) => {
      if (!can(ctx.userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }
      if (!isTelemetryEnabled()) {
        return jsonError({
          message: ctx.t?.("telemetry.telemetryDisabled",) ?? "Telemetry is disabled",
          status: HttpStatus.NotFound,
        },);
      }

      const rows = await database
        .selectFrom("telemetry_events",)
        .select(["event_type", (eb,) => eb.fn.countAll<number>().as("count",),],)
        .where("event_type", "in", ["generation.started", "generation.completed", "generation.failed",],)
        .groupBy("event_type",)
        .execute();

      return jsonResponse(rows,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get model analytics",
        description: "Get generation event counts by type (started, completed, failed). Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },)
    .get(`${prefix}/telemetry/analytics/errors`, async (ctx: any,) => {
      if (!can(ctx.userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }
      if (!isTelemetryEnabled()) {
        return jsonError({
          message: ctx.t?.("telemetry.telemetryDisabled",) ?? "Telemetry is disabled",
          status: HttpStatus.NotFound,
        },);
      }

      const rows = await database
        .selectFrom("telemetry_events",)
        .selectAll()
        .where("event_type", "like", "%failed%",)
        .orderBy("created_at", "desc",)
        .limit(50,)
        .execute();

      return jsonResponse(rows,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get error analytics",
        description: "Get recent failed telemetry events. Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },)
    .get(`${prefix}/telemetry/analytics/daily`, async (ctx: any,) => {
      if (!can(ctx.userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }
      if (!isTelemetryEnabled()) {
        return jsonError({
          message: ctx.t?.("telemetry.telemetryDisabled",) ?? "Telemetry is disabled",
          status: HttpStatus.NotFound,
        },);
      }

      const limit = Number(ctx.query.limit,) || 30;
      const rows = await database
        .selectFrom("telemetry_events",)
        .select([
          (eb,) => eb.fn.countAll<number>().as("count",),
          (eb,) => eb.fn.count<number>("id",).distinct().as("active_users",),
          (eb,) => eb.fn("date", ["created_at",],).as("date",),
        ],)
        .groupBy("date",)
        .orderBy("date", "desc",)
        .limit(limit,)
        .execute();

      return jsonResponse(rows,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get daily analytics",
        description: "Get daily event counts and active users over time. Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },)
    .delete(`${prefix}/telemetry/analytics/purge`, async (ctx: any,) => {
      // BUG-telemetry-purge-unbounded-days — handler lives in ./telemetry-purge
      return purgeTelemetryEvents(database, ctx,);
    }, {
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
      detail: {
        summary: "Purge old telemetry",
        description:
          "Delete telemetry events older than the retention period (clamped 1..365 days). Requires ?confirm=PURGE. Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },);
}
