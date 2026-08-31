// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry Routes
 *
 * Frontend event ingestion plus admin analytics dashboard.
 *
 * Privacy posture (BUG-telemetry-errors-leaks-raw-event-data):
 *   - Ingest accepts ONLY the typed `TelemetryEventBody` union. The body
 *     has no `sessionId` / `userId` / `chatId` keys — those are
 *     server-derived from the request context.
 *   - `event_data` is byte-capped at `TELEMETRY_EVENT_DATA_MAX_BYTES`
 *     (8 KiB) in the service layer; oversize events are dropped.
 *   - `GET /api/telemetry/analytics/errors` returns ONLY the narrowed
 *     projection (`event_type`, `source`, `created_at`, `occurrences`).
 *     `event_data`, `user_id`, `chat_id`, `session_id` are no longer in
 *     the wire shape.
 *   - Analytics responses are restricted to `source = 'server'`.
 *
 * `occurrences` is derived via GROUP BY (SQLite has no window functions
 * in the Bun-bundled driver).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../routes/http-utils";

import {
  isFrontendTelemetryEnabled,
  isTelemetryEnabled,
  record,
} from "../telemetry/service";
import { can, } from "../users/permissions";
import {
  ErrorResponse,
  SuccessResponse,
  TelemetryAnalyticsErrorsRow,
  TelemetryEventBody,
} from "../validation/schemas";
import { purgeTelemetryEvents, } from "./telemetry-purge";

interface HandleOpts {
  database: Kysely<DB>;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function telemetryRoutes({ database, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "telemetry", },)
    .post(`${prefix}/telemetry/event`, async (ctx: any,) => {
      if (!isFrontendTelemetryEnabled()) {
        return jsonResponse({ ok: true, dropped: "frontend telemetry disabled", },);
      }
      await record(database, {
        eventType: ctx.body.type,
        sessionId: ctx.sessionId ?? null,
        userId: ctx.userId ?? null,
        chatId: ctx.chatId ?? null,
        data: ctx.body.data ?? {},
        source: "frontend",
      },);
      return jsonResponse({ ok: true, },);
    }, {
      body: TelemetryEventBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
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
      const row = await database
        .selectFrom("telemetry_events",)
        .select((eb,) => eb.fn.count<number>("id",).as("total",))
        .where("source", "=", "server",)
        .executeTakeFirst();
      return jsonResponse({ total: row?.total ?? 0, },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get summary analytics",
        description: "Get total telemetry events count (server-only). Admin only.",
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
        .select(["event_type",],)
        .select((eb,) => eb.fn.count<number>("id",).as("count",))
        .where("event_type", "like", "generation.%",)
        .where("source", "=", "server",)
        .groupBy("event_type",)
        .execute();
      return jsonResponse(rows,);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
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
        .select(["event_type", "source", "created_at",],)
        .select((eb,) => eb.fn.count<number>("id",).as("occurrences",))
        .where("event_type", "like", "%failed%",)
        .where("source", "=", "server",)
        .groupBy("event_type",)
        .groupBy("source",)
        .groupBy("created_at",)
        .orderBy("created_at", "desc",)
        .limit(50,)
        .execute();
      return jsonResponse(rows,);
    }, {
      response: { 200: t.Array(TelemetryAnalyticsErrorsRow,), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get error analytics",
        description: "Get recent failed telemetry events (narrow projection, server-only). Admin only.",
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
      const limit = Number(ctx.query.limit ?? 7,);
      const rows = await database
        .selectFrom("telemetry_events",)
        .select((eb,) => [
          sql<string>`substr(${eb.ref("telemetry_events.created_at",)}, 1, 10)`.as("date",),
        ])
        .select((eb,) => eb.fn.count<number>("id",).as("count",))
        .where("source", "=", "server",)
        .groupBy("date",)
        .orderBy("date", "desc",)
        .limit(limit,)
        .execute();
      return jsonResponse(rows,);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get daily analytics",
        description: "Get telemetry event counts grouped by day. Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },)
    .delete(`${prefix}/telemetry/analytics/purge`, async (ctx: any,) =>
      // BUG-telemetry-purge-unbounded-days — handler lives in ./telemetry-purge
      purgeTelemetryEvents(database, ctx,), {
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Purge old telemetry",
        description:
          "Delete telemetry events older than the retention period (clamped 1..365 days). Requires ?confirm=PURGE. Admin only.",
        tags: ["Telemetry", "Analytics",],
      },
    },);
}
