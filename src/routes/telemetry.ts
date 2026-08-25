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
import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../routes/http-utils";
import {
  isFrontendTelemetryEnabled,
  isTelemetryEnabled,
  record,
} from "../telemetry/service";
import { can, } from "../users/permissions";
import { jsonStringifyOr, } from "../utils/safe-json";
import { ErrorResponse, SuccessResponse, TelemetryEventBody, } from "../validation/schemas";

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
      if (!can(ctx.userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      // BUG-telemetry-purge-unbounded-days: clamp days to [1, 365] and require
      // a confirmation token before destructive execution.
      const rawDays = ctx.query?.days;
      const retentionDays = Number(rawDays,);
      if (
        rawDays === undefined ||
        !Number.isFinite(retentionDays,) ||
        retentionDays < 1 ||
        retentionDays > 365 ||
        !Number.isInteger(retentionDays,)
      ) {
        return jsonError({
          message: "days must be an integer in [1, 365]",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const confirm = ctx.query?.confirm ?? ctx.body?.confirm;
      if (confirm !== "PURGE") {
        return jsonError({
          message: "missing or invalid confirmation token (expected ?confirm=PURGE)",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const cutoff = new Date(Date.now() - retentionDays * 86_400_000,).toISOString();
      const result = await database.deleteFrom("telemetry_events",).where("created_at", "<", cutoff,).execute();
      const count = Number(result[0]?.numDeletedRows ?? 0n,);

      // Audit row — captured BEFORE the response so the action is traceable.
      await database.insertInto("log_entries",).values({
        id: crypto.randomUUID(),
        level: 2, // warn
        timestamp: Date.now(),
        time: new Date().toISOString(),
        message: "telemetry.purge",
        module: "telemetry",
        event_type: "admin",
        action: "telemetry-purge",
        user_id: typeof ctx.userId === "string" ? ctx.userId : null,
        session_id: null,
        request_id: null,
        meta: jsonStringifyOr({ retentionDays, count, cutoff, },),
        entity_type: "telemetry_events",
        entity_id: null,
        created_at: new Date().toISOString(),
      },).execute();

      getLogger().child({ module: "telemetry", },).warn("Purged old telemetry events", {
        retentionDays,
        cutoff,
        count,
      },);

      return jsonResponse({ ok: true, purged: true, count, },);
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
