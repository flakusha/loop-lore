// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Generation quality metrics (FEAT-062 AC1/AC3/AC4/AC5). */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { aggregateQuality, } from "../../generation/quality";
import type { QualityGroupRow, } from "../../generation/quality";
import { parseExpiryMs, toDate, } from "../../utils/date";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { AnalyticsCtx, } from "./types";

/** Filters accepted by the quality endpoint. */
interface QualityFilters {
  model: string | null;
  chatId: string | null;
  from: string | null;
  to: string | null;
}

/** Finish reason recorded for a generation (guarded against malformed JSON). */
const FINISH_REASON = sql<
  string
>`case when json_valid(messages.metadata) then json_extract(messages.metadata, '$.quality.finishReason') end`;

/** Trigram repetition rate recorded for a generation (guarded likewise). */
const REPETITION_RATE = sql<
  number
>`case when json_valid(messages.metadata) then cast(json_extract(messages.metadata, '$.quality.repetitionRate') as real) end`;

/** UTC day bucket of a generation. */
const DAY = sql<string>`date(messages.created_at)`;

/**
 * GET /api/analytics/quality - aggregated generation quality metrics.
 *
 * Source is the assistant message row: it carries the token counts, the model
 * and the `metadata.quality` blob (repetition rate, finish reason, latency)
 * written at generation time. Ownership is enforced by the inner join on
 * `chats.created_by` - a shared chat contributes only to its creator.
 */
export async function qualityHandler(db: Kysely<DB>, ctx: AnalyticsCtx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const query = (ctx.query ?? {}) as { model?: string; chatId?: string; from?: string; to?: string };
  const filters: QualityFilters = {
    model: query.model?.trim() || null,
    chatId: query.chatId?.trim() || null,
    from: query.from?.trim() || null,
    to: query.to?.trim() || null,
  };

  // A chat filter must name a chat the caller owns. Anything else - unknown
  // chat, or a chat owned by somebody else - is reported as "not found" so the
  // endpoint never reveals whether a foreign chat exists.
  if (filters.chatId !== null) {
    const owned = await db
      .selectFrom("chats",)
      .select("id",)
      .where("id", "=", filters.chatId,)
      .where("created_by", "=", userId,)
      .executeTakeFirst();

    if (!owned) { return jsonError("Chat not found", 404,); }
  }

  const fromMs = parseExpiryMs(filters.from,);
  const toMs = parseExpiryMs(filters.to,);
  const fromIso = fromMs === null ? null : toDate(fromMs,).toISOString();
  const toIso = toMs === null ? null : toDate(toMs,).toISOString();

  let rows = db
    .selectFrom("messages",)
    .innerJoin("chats", "chats.id", "messages.chat_id",)
    .where("chats.created_by", "=", userId,)
    .where("messages.role", "=", "assistant",)
    .where("messages.model_id", "is not", null,)
    .where(
      sql<
        boolean
      >`(case when json_valid(messages.metadata) then json_extract(messages.metadata, '$.quality') end) is not null`,
    );

  if (filters.model !== null) { rows = rows.where("messages.model_id", "=", filters.model,); }
  if (filters.chatId !== null) { rows = rows.where("messages.chat_id", "=", filters.chatId,); }
  // `created_at` is stored in SQLite datetime text by the DB default, but the
  // bound is ISO - raw string comparison mis-orders the two formats, so both
  // sides are normalized with datetime() first.
  if (fromIso !== null) {
    rows = rows.where(sql<boolean>`datetime(messages.created_at) >= datetime(${fromIso})`,);
  }

  if (toIso !== null) {
    rows = rows.where(sql<boolean>`datetime(messages.created_at) < datetime(${toIso})`,);
  }

  const grouped = await rows
    .groupBy([DAY, sql`messages.model_id`, sql`messages.provider`, FINISH_REASON,],)
    .select([
      DAY.as("day",),
      sql<string | null>`messages.model_id`.as("model",),
      sql<string | null>`messages.provider`.as("provider",),
      FINISH_REASON.as("finishReason",),
      sql<number>`count(*)`.as("generations",),
      sql<number>`coalesce(sum(messages.token_count_prompt), 0)`.as("promptTokens",),
      sql<number>`coalesce(sum(messages.token_count_completion), 0)`.as("completionTokens",),
      sql<number>`coalesce(sum(messages.token_count_total), 0)`.as("totalTokens",),
      sql<number>`coalesce(sum(messages.generation_time_ms), 0)`.as("latencySumMs",),
      sql<number>`count(messages.generation_time_ms)`.as("latencyCount",),
      sql<number>`coalesce(sum(messages.tokens_per_second), 0)`.as("tokensPerSecondSum",),
      sql<number>`count(messages.tokens_per_second)`.as("tokensPerSecondCount",),
      sql<number>`coalesce(sum(${REPETITION_RATE}), 0)`.as("repetitionRateSum",),
      sql<number>`count(${REPETITION_RATE})`.as("repetitionRateCount",),
    ],)
    .execute();

  const buckets: QualityGroupRow[] = grouped.map((row,) => ({
    day: String(row.day,),
    model: row.model ?? null,
    provider: row.provider ?? null,
    finishReason: row.finishReason ?? null,
    generations: Number(row.generations ?? 0,),
    promptTokens: Number(row.promptTokens ?? 0,),
    completionTokens: Number(row.completionTokens ?? 0,),
    totalTokens: Number(row.totalTokens ?? 0,),
    latencySumMs: Number(row.latencySumMs ?? 0,),
    latencyCount: Number(row.latencyCount ?? 0,),
    tokensPerSecondSum: Number(row.tokensPerSecondSum ?? 0,),
    tokensPerSecondCount: Number(row.tokensPerSecondCount ?? 0,),
    repetitionRateSum: Number(row.repetitionRateSum ?? 0,),
    repetitionRateCount: Number(row.repetitionRateCount ?? 0,),
  }));

  return jsonResponse(aggregateQuality(buckets,),);
}
