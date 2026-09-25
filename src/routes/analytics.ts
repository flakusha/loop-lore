// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Conversation analytics endpoints for the FEAT-059 dashboard. */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { checkChatAccess, } from "../chat/service/access";
import type { DB, } from "../db/schema";
import { parseExpiryMs, toDate, } from "../utils/date";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";
interface HandleOpts {
  database: Kysely<DB>;
}

const COST_PER_1K_TOKENS = 0.002;

function parseIsoMs(value: string | undefined,): number | null {
  return parseExpiryMs(value,);
}

function emptyChatMetrics() {
  return {
    totalMessages: 0,
    messageCounts: { user: 0, assistant: 0, system: 0, },
    totalTokens: 0,
    avgMessageLength: 0,
    activeTimeSpanMs: 0,
    totalGenerations: 0,
    avgLatencyMs: 0,
    costEstimate: 0,
  };
}

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

      const { chatId, } = ctx.params as { chatId: string };
      const access = await checkChatAccess(database, chatId, userId, null,);
      const canReadChat = access.ok;
      if (!canReadChat) {
        const chatExists = await database
          .selectFrom("chats",)
          .select("id",)
          .where("id", "=", chatId,)
          .executeTakeFirst();
        if (chatExists !== undefined) { return jsonResponse(emptyChatMetrics(),); }
      }

      const { from, to, } = (ctx.query ?? {}) as { from?: string; to?: string };
      const fromMs = parseIsoMs(from,);
      const toMs = parseIsoMs(to,);
      const fromIso = fromMs === null ? null : toDate(fromMs,).toISOString();
      const toIso = toMs === null ? null : toDate(toMs,).toISOString();

      let messages = database
        .selectFrom("messages",)
        .where("chat_id", "=", chatId,);
      if (!canReadChat) { messages = messages.where("id", "=", "__no_access__",); }
      if (fromIso !== null) { messages = messages.where("created_at", ">=", fromIso,); }
      if (toIso !== null) { messages = messages.where("created_at", "<", toIso,); }

      const messageStats = await messages.select([
        sql<number>`count(*)`.as("totalMessages",),
        sql<number>`coalesce(sum(CASE WHEN role = 'user' THEN 1 ELSE 0 END), 0)`.as("userMessages",),
        sql<number>`coalesce(sum(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END), 0)`.as("assistantMessages",),
        sql<number>`coalesce(sum(CASE WHEN role = 'system' THEN 1 ELSE 0 END), 0)`.as("systemMessages",),
        sql<number>`coalesce(sum(token_count_total), 0)`.as("totalTokens",),
        sql<number>`coalesce(avg(length(content)), 0)`.as("avgMessageLength",),
        sql<number>`coalesce((julianday(max(created_at)) - julianday(min(created_at))) * 86400000, 0)`.as(
          "activeTimeSpanMs",
        ),
      ],).executeTakeFirst();

      let generations = database
        .selectFrom("telemetry_events",)
        .where("chat_id", "=", chatId,)
        .where("user_id", "=", userId,)
        .where("event_type", "=", "generation.completed",);
      if (fromIso !== null) { generations = generations.where("created_at", ">=", fromIso,); }
      if (toIso !== null) { generations = generations.where("created_at", "<", toIso,); }
      const generationStats = await generations.select([
        sql<number>`count(*)`.as("totalGenerations",),
        sql<number>`coalesce(sum(CAST(json_extract(event_data, '$.totalTokens') AS INTEGER)), 0)`.as(
          "generationTokens",
        ),
        sql<number>`coalesce(avg(CAST(json_extract(event_data, '$.latencyMs') AS INTEGER)), 0)`.as("avgLatencyMs",),
      ],).executeTakeFirst();
      const totalTokens = generationStats?.generationTokens ?? messageStats?.totalTokens ?? 0;

      return jsonResponse({
        totalMessages: messageStats?.totalMessages ?? 0,
        messageCounts: {
          user: messageStats?.userMessages ?? 0,
          assistant: messageStats?.assistantMessages ?? 0,
          system: messageStats?.systemMessages ?? 0,
        },
        totalTokens,
        avgMessageLength: Math.round(messageStats?.avgMessageLength ?? 0,),
        activeTimeSpanMs: Math.round(messageStats?.activeTimeSpanMs ?? 0,),
        totalGenerations: generationStats?.totalGenerations ?? 0,
        avgLatencyMs: generationStats?.avgLatencyMs ?? 0,
        costEstimate: Math.round(totalTokens / 1000 * COST_PER_1K_TOKENS * 100,) / 100,
        from: from ?? null,
        to: to ?? null,
      },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
    },)
    .get(`${prefix}/analytics/overview`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const overview = await database
        .selectFrom("chats",)
        .leftJoin("messages", "messages.chat_id", "chats.id",)
        .where("chats.created_by", "=", userId,)
        .groupBy("chats.id",)
        .select([
          sql<number>`count(messages.id)`.as("totalMessages",),
          sql<number>`coalesce(sum(messages.token_count_total), 0)`.as("totalTokens",),
        ],)
        .execute();
      const totalMessages = overview.reduce((sum, row,) => sum + Number(row.totalMessages ?? 0,), 0,);
      const messageTotalTokens = overview.reduce((sum, row,) => sum + Number(row.totalTokens ?? 0,), 0,);
      const topChats = await database
        .selectFrom("chats",)
        .leftJoin("messages", "messages.chat_id", "chats.id",)
        .where("chats.created_by", "=", userId,)
        .groupBy("chats.id",)
        .select([
          "chats.id",
          "chats.name",
          sql<number>`coalesce(sum(messages.token_count_total), 0)`.as("totalTokens",),
          sql<number>`count(messages.id)`.as("totalMessages",),
        ],)
        .orderBy("totalTokens", "desc",)
        .limit(5,)
        .execute();

      const completed = await database
        .selectFrom("telemetry_events",)
        .where("user_id", "=", userId,)
        .where("event_type", "=", "generation.completed",)
        .select([
          sql<number>`count(*)`.as("totalGenerations",),
          sql<number>`coalesce(sum(CAST(json_extract(event_data, '$.totalTokens') AS INTEGER)), 0)`.as("totalTokens",),
          sql<number>`coalesce(avg(CAST(json_extract(event_data, '$.latencyMs') AS INTEGER)), 0)`.as("avgLatencyMs",),
        ],)
        .executeTakeFirst();
      const failed = await database
        .selectFrom("telemetry_events",)
        .where("user_id", "=", userId,)
        .where("event_type", "=", "generation.failed",)
        .select(sql<number>`count(*)`.as("failedGenerations",),)
        .executeTakeFirst();
      const totalGenerationTokens = Number(completed?.totalTokens ?? 0,);
      const totalTokens = totalGenerationTokens || messageTotalTokens;

      return jsonResponse({
        totalMessages,
        totalTokens,
        topChats,
        averageSessionLength: overview.length === 0 ? 0 : totalMessages / overview.length,
        totalGenerations: completed?.totalGenerations ?? 0,
        avgLatencyMs: completed?.avgLatencyMs ?? 0,
        costEstimate: Math.round(totalTokens / 1000 * COST_PER_1K_TOKENS * 100,) / 100,
        failedGenerations: failed?.failedGenerations ?? 0,
      },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
    },);
}
