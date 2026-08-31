// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { jsonResponse, requireUserId, } from "../routes/http-utils";
import { isTelemetryEnabled, } from "../telemetry/service";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";

interface HandleOpts {
  database: Kysely<DB>;
}

/** Rough cost estimate: $0.002 per 1K tokens (blended average across providers) */
const COST_PER_1K_TOKENS = 0.002;

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function analyticsRoutes({ database, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "analytics", },)
    .get(`${prefix}/analytics/chat/:chatId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

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
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get chat analytics",
        description:
          "Retrieve per-chat statistics including message count, token usage, average latency, and cost estimate.",
        tags: ["Analytics",],
      },
    },)
    .get(`${prefix}/analytics/overview`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

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
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get analytics overview",
        description:
          "Retrieve aggregate statistics across all chats including total messages, tokens, latency, and cost estimate.",
        tags: ["Analytics",],
      },
    },);
}
