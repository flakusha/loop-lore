// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Per-chat conversation metrics (FEAT-059 AC3). */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { checkChatAccess, } from "../../chat/service/access";
import type { DB, } from "../../db/schema";
import { hashId, } from "../../telemetry/service";
import { parseExpiryMs, toDate, } from "../../utils/date";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { AnalyticsCtx, } from "./types";

const COST_PER_1K_TOKENS = 0.002;

// GET /api/analytics/chats/:chatId — per-chat stats with optional ISO date range.
// Returns 404 when the caller cannot access the chat; 401 via `requireUserId`.
export async function chatDetailHandler(db: Kysely<DB>, ctx: AnalyticsCtx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const { chatId, } = ctx.params as { chatId: string };
  // Telemetry rows store SHA-256-hashed IDs (`telemetry/service.ts`), so
  // these filters must hash the raw request values the same way or every
  // row reads 0 (BUG-analytics-per-user-routes-filter-telemetry-events-by-raw-ids).
  const telemetryChatId = hashId(chatId,) ?? "";
  const telemetryUserId = hashId(userId,) ?? "";
  const access = await checkChatAccess(db, chatId, userId, null,);
  if (!access.ok) {
    return jsonError("Chat not found", 404,);
  }

  const { from, to, } = (ctx.query ?? {}) as { from?: string; to?: string };
  const fromMs = parseExpiryMs(from,);
  const toMs = parseExpiryMs(to,);
  const fromIso = fromMs === null ? null : toDate(fromMs,).toISOString();
  const toIso = toMs === null ? null : toDate(toMs,).toISOString();

  let messages = db.selectFrom("messages",).where("chat_id", "=", chatId,);
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

  let generations = db
    .selectFrom("telemetry_events",)
    .where("chat_id", "=", telemetryChatId,)
    .where("user_id", "=", telemetryUserId,)
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
}
