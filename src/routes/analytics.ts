/**
 * Analytics Routes
 *
 * Conversation analytics dashboard endpoints.
 *
 *   GET /api/analytics/chat/:chatId — Per-chat stats (message count, token usage, avg latency)
 *   GET /api/analytics/overview      — Aggregate stats (total messages, total tokens, avg latency, cost estimate)
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonError, jsonResponse, } from "../routes/http-utils";
import { isTelemetryEnabled, } from "../telemetry/service";

interface HandleOpts {
  database: Kysely<DB>;
}

/** Rough cost estimate: $0.002 per 1K tokens (blended average across providers) */
const COST_PER_1K_TOKENS = 0.002;

export function analyticsRoutes({ database, }: HandleOpts,): Elysia {
  return new Elysia({ name: "analytics", },)
    .get("/api/analytics/chat/:chatId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({ message: "Unauthorized", status: 401, },);
      }

      if (!isTelemetryEnabled()) {
        return jsonResponse({
          totalGenerations: 0,
          totalTokens: 0,
          avgLatencyMs: 0,
          costEstimate: 0,
        },);
      }

      const { chatId, } = ctx.params;

      const stats = await database
        .selectFrom("telemetry_events",)
        .where("chat_id", "=", chatId,)
        .where("event_type", "=", "generation.completed",)
        .select([
          sql<number>`count(*)`.as("totalGenerations",),
          sql<number>`coalesce(sum(CAST(json_extract(event_data, '$.totalTokens') AS INTEGER)), 0)`.as("totalTokens",),
          sql<number>`coalesce(avg(CAST(json_extract(event_data, '$.latencyMs') AS INTEGER)), 0)`.as("avgLatencyMs",),
        ],)
        .executeTakeFirst();

      const totalTokens = stats?.totalTokens ?? 0;
      const costEstimate = Math.round(totalTokens / 1000 * COST_PER_1K_TOKENS * 100,) / 100;

      return jsonResponse({
        totalGenerations: stats?.totalGenerations ?? 0,
        totalTokens,
        avgLatencyMs: stats?.avgLatencyMs ?? 0,
        costEstimate,
      },);
    },)
    .get("/api/analytics/overview", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({ message: "Unauthorized", status: 401, },);
      }

      if (!isTelemetryEnabled()) {
        return jsonResponse({
          totalGenerations: 0,
          totalTokens: 0,
          avgLatencyMs: 0,
          costEstimate: 0,
          failedGenerations: 0,
        },);
      }

      const completed = await database
        .selectFrom("telemetry_events",)
        .where("event_type", "=", "generation.completed",)
        .select([
          sql<number>`count(*)`.as("totalGenerations",),
          sql<number>`coalesce(sum(CAST(json_extract(event_data, '$.totalTokens') AS INTEGER)), 0)`.as("totalTokens",),
          sql<number>`coalesce(avg(CAST(json_extract(event_data, '$.latencyMs') AS INTEGER)), 0)`.as("avgLatencyMs",),
        ],)
        .executeTakeFirst();

      const failed = await database
        .selectFrom("telemetry_events",)
        .where("event_type", "=", "generation.failed",)
        .select([
          sql<number>`count(*)`.as("failedGenerations",),
        ],)
        .executeTakeFirst();

      const totalTokens = completed?.totalTokens ?? 0;
      const costEstimate = Math.round(totalTokens / 1000 * COST_PER_1K_TOKENS * 100,) / 100;

      return jsonResponse({
        totalGenerations: completed?.totalGenerations ?? 0,
        totalTokens,
        avgLatencyMs: completed?.avgLatencyMs ?? 0,
        costEstimate,
        failedGenerations: failed?.failedGenerations ?? 0,
      },);
    },) as unknown as Elysia;
}
