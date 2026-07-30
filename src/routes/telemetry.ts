/**
 * Telemetry Routes
 *
 *   POST /api/telemetry/event         — accept frontend event (sendBeacon)
 *   GET  /api/telemetry/analytics/*   — admin analytics (admin-gated)
 *   DELETE /api/telemetry/analytics/purge — purge old events (admin-gated)
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../routes/http-utils";
import { isFrontendTelemetryEnabled, isTelemetryEnabled, } from "../telemetry/service";
import { record, } from "../telemetry/service";

interface HandleOpts {
  database: Kysely<DB>;
}

export function telemetryRoutes({ database, }: HandleOpts,): Elysia {
  return new Elysia({ name: "telemetry", },)
    .post("/api/telemetry/event", async (ctx: any,) => {
      if (!isFrontendTelemetryEnabled()) {
        return jsonResponse({ ok: true, dropped: "frontend telemetry disabled", },);
      }

      const body = ctx.body as Record<string, unknown> | undefined;
      if (!body?.type) {
        return jsonError({
          message: ctx.t?.("telemetry.eventTypeRequired",) ?? "event type is required",
          status: HttpStatus.BadRequest,
        },);
      }

      await record(database, {
        eventType: body.type as string,
        sessionId: body.sessionId as string | undefined,
        userId: body.userId as string | undefined,
        chatId: body.chatId as string | undefined,
        data: (body.data as Record<string, unknown>) ?? {},
      },);

      return jsonResponse({ ok: true, },);
    },)
    .get("/api/telemetry/analytics/summary", async (ctx: any,) => {
      if (ctx.userRole !== "admin") {
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
    },)
    .get("/api/telemetry/analytics/models", async (ctx: any,) => {
      if (ctx.userRole !== "admin") {
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
    },)
    .get("/api/telemetry/analytics/errors", async (ctx: any,) => {
      if (ctx.userRole !== "admin") {
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
    },)
    .get("/api/telemetry/analytics/daily", async (ctx: any,) => {
      if (ctx.userRole !== "admin") {
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
    },)
    .delete("/api/telemetry/analytics/purge", async (ctx: any,) => {
      if (ctx.userRole !== "admin") {
        return jsonError({
          message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      const retentionDays = Number(ctx.query.days,) || 90;
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000,).toISOString();

      await database.deleteFrom("telemetry_events",).where("created_at", "<", cutoff,).execute();

      getLogger().child({ module: "telemetry", },).info("Purged old telemetry events", {
        retentionDays,
        cutoff,
      },);

      return jsonResponse({ ok: true, purged: true, },);
    },) as unknown as Elysia;
}
