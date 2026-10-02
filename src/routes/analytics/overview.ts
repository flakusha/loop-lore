// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Cross-chat aggregate metrics (FEAT-059 AC2/AC4). */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { hashId, } from "../../telemetry/service";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { AnalyticsCtx, } from "./types";

const COST_PER_1K_TOKENS = 0.002;

/** Latency histogram buckets, in display order. */
const LATENCY_BUCKETS = ["<500ms", "500-1000ms", "1000-2000ms", "2000-5000ms", ">5000ms",] as const;

// GET /api/analytics/overview — aggregate stats across the caller's chats.
export async function overviewHandler(db: Kysely<DB>, ctx: AnalyticsCtx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const telemetryUserId = hashId(userId,) ?? "";

  const overview = await db
    .selectFrom("chats",)
    .leftJoin("messages", "messages.chat_id", "chats.id",)
    .where("chats.created_by", "=", userId,)
    .groupBy("chats.id",)
    .select([
      sql<number>`count(messages.id)`.as("totalMessages",),
      sql<number>`coalesce(sum(messages.token_count_total), 0)`.as("totalTokens",),
      sql<number>`coalesce(sum(CASE WHEN messages.role = 'user' THEN messages.token_count_total ELSE 0 END), 0)`
        .as("userTokens",),
      sql<number>`coalesce(sum(CASE WHEN messages.role = 'assistant' THEN messages.token_count_total ELSE 0 END), 0)`
        .as("assistantTokens",),
      sql<number>`coalesce(sum(CASE WHEN messages.role = 'system' THEN messages.token_count_total ELSE 0 END), 0)`
        .as("systemTokens",),
    ],)
    .execute();
  const totalMessages = overview.reduce((sum, row,) => sum + Number(row.totalMessages ?? 0,), 0,);
  const messageTotalTokens = overview.reduce((sum, row,) => sum + Number(row.totalTokens ?? 0,), 0,);
  const tokensByRole = {
    user: overview.reduce((sum, row,) => sum + Number(row.userTokens ?? 0,), 0,),
    assistant: overview.reduce((sum, row,) => sum + Number(row.assistantTokens ?? 0,), 0,),
    system: overview.reduce((sum, row,) => sum + Number(row.systemTokens ?? 0,), 0,),
  };

  const topChats = await db
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

  // Bucket generation latencies in the same query as the aggregate so the
  // dashboard histogram costs no extra round-trip.
  const completed = await db
    .selectFrom("telemetry_events",)
    .where("user_id", "=", telemetryUserId,)
    .where("event_type", "=", "generation.completed",)
    .select([
      sql<number>`count(*)`.as("totalGenerations",),
      sql<number>`coalesce(sum(CAST(json_extract(event_data, '$.totalTokens') AS INTEGER)), 0)`.as("totalTokens",),
      sql<number>`coalesce(avg(CAST(json_extract(event_data, '$.latencyMs') AS INTEGER)), 0)`.as("avgLatencyMs",),
      sql<
        number
      >`coalesce(sum(CASE WHEN CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) < 500 THEN 1 ELSE 0 END), 0)`
        .as("b1",),
      sql<
        number
      >`coalesce(sum(CASE WHEN CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) >= 500 AND CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) < 1000 THEN 1 ELSE 0 END), 0)`
        .as("b2",),
      sql<
        number
      >`coalesce(sum(CASE WHEN CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) >= 1000 AND CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) < 2000 THEN 1 ELSE 0 END), 0)`
        .as("b3",),
      sql<
        number
      >`coalesce(sum(CASE WHEN CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) >= 2000 AND CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) < 5000 THEN 1 ELSE 0 END), 0)`
        .as("b4",),
      sql<
        number
      >`coalesce(sum(CASE WHEN CAST(json_extract(event_data, '$.latencyMs') AS INTEGER) >= 5000 THEN 1 ELSE 0 END), 0)`
        .as("b5",),
    ],)
    .executeTakeFirst();
  const failed = await db
    .selectFrom("telemetry_events",)
    .where("user_id", "=", telemetryUserId,)
    .where("event_type", "=", "generation.failed",)
    .select(sql<number>`count(*)`.as("failedGenerations",),)
    .executeTakeFirst();
  const totalGenerationTokens = Number(completed?.totalTokens ?? 0,);
  const totalTokens = totalGenerationTokens || messageTotalTokens;
  const bucketCounts = [
    completed?.b1,
    completed?.b2,
    completed?.b3,
    completed?.b4,
    completed?.b5,
  ];
  const latencyBuckets = LATENCY_BUCKETS.map((label, index,) => ({
    label,
    count: Number(bucketCounts[index] ?? 0,),
  }));

  return jsonResponse({
    totalMessages,
    totalTokens,
    tokensByRole,
    topChats,
    averageSessionLength: overview.length === 0 ? 0 : totalMessages / overview.length,
    totalGenerations: completed?.totalGenerations ?? 0,
    avgLatencyMs: completed?.avgLatencyMs ?? 0,
    latencyBuckets,
    costEstimate: Math.round(totalTokens / 1000 * COST_PER_1K_TOKENS * 100,) / 100,
    failedGenerations: failed?.failedGenerations ?? 0,
  },);
}
