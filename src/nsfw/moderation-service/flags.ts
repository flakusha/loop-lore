// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — content flags
 *
 * Flagging content, reading the review queue, and resolving flags.
 */
import type { ContentFlag, NsfwModerationServiceContext, } from "./types";

export interface FlagContentArgs {
  thisL: NsfwModerationServiceContext;
  params: {
    reporterId: string;
    contentType: string;
    contentId: string;
    chatId?: string;
    worldId?: string;
    flagReason: string;
    description?: string;
  };
}

/** Submit a content flag for review. */
export async function flagContent({ thisL, params, }: FlagContentArgs,): Promise<ContentFlag> {
  const existing = await thisL.db.selectFrom("content_flags",).selectAll().where(
    "content_type",
    "=",
    params.contentType,
  ).where(
    "content_id",
    "=",
    params.contentId,
  ).where("status", "in", ["pending", "under_review",],).executeTakeFirst();
  if (existing) { throw new Error("Content already flagged for review.",); }

  const dismissedCount = await thisL.db.selectFrom("content_flags",).where("reporter_id", "=", params.reporterId,)
    .where("status", "=", "dismissed",).select(({ fn, },) => fn.count<number>("id",).as("count",)).executeTakeFirst();
  if (dismissedCount && dismissedCount.count >= 3) {
    thisL.log.warn("Reporter has 3+ dismissed flags", { reporterId: params.reporterId, },);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await thisL.db.insertInto("content_flags",).values({
    id,
    reporter_id: params.reporterId,
    content_type: params.contentType,
    content_id: params.contentId,
    chat_id: params.chatId ?? null,
    world_id: params.worldId ?? null,
    flag_reason: params.flagReason,
    description: params.description ?? null,
    status: "pending",
    created_at: now,
  },).execute();

  thisL.log.info("Content flagged", { id, reporterId: params.reporterId, },);
  return {
    id,
    reporterId: params.reporterId,
    contentType: params.contentType,
    contentId: params.contentId,
    chatId: params.chatId ?? null,
    worldId: params.worldId ?? null,
    flagReason: params.flagReason,
    description: params.description ?? null,
    status: "pending",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now,
  };
}

export interface GetFlagQueueArgs {
  thisL: NsfwModerationServiceContext;
  params?: { status?: string; limit?: number; offset?: number };
}

/** Read a page of flags filtered by status, plus the total count. */
export async function getFlagQueue(
  { thisL, params, }: GetFlagQueueArgs,
): Promise<{ flags: ContentFlag[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const status = params?.status ?? "pending";
  const [rowsResult, countResult,] = await Promise.allSettled([
    thisL.db.selectFrom("content_flags",).where("status", "=", status,).orderBy("created_at", "desc",).limit(limit,)
      .offset(offset,).selectAll().execute(),
    thisL.db.selectFrom("content_flags",).where("status", "=", status,).select(({ fn, },) =>
      fn.count<number>("id",).as("count",)
    ).executeTakeFirst(),
  ],);
  const flagRows = rowsResult.status === "fulfilled" ? rowsResult.value : [];
  const countVal = countResult.status === "fulfilled" ? countResult.value : null;
  const flags = Array.from(flagRows, (r,) => mapFlag(r,),);
  return { flags, total: countVal?.count ?? 0, };
}

export interface ResolveFlagArgs {
  thisL: NsfwModerationServiceContext;
  flagId: string;
  resolvedBy: string;
  resolution: string;
  status: "resolved" | "dismissed" | "confirmed";
}

/** Resolve a flag with a disposition and resolution note. */
export async function resolveFlag(
  { thisL, flagId, resolvedBy, resolution, status, }: ResolveFlagArgs,
): Promise<ContentFlag> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("content_flags",).set({ status, resolution, resolved_by: resolvedBy, resolved_at: now, },)
    .where("id", "=", flagId,).execute();
  thisL.log.info("Content flag resolved", { flagId, resolvedBy, status, },);
  const row = await thisL.db.selectFrom("content_flags",).where("id", "=", flagId,).selectAll().executeTakeFirst();
  if (!row) { throw new Error(`Flag ${flagId} not found after resolution.`,); }
  return mapFlag(row,);
}

/** Map a storage row (snake_case) to the camel-cased ContentFlag shape. */
export function mapFlag(
  row: {
    id: string;
    reporter_id: string;
    content_type: string;
    content_id: string;
    chat_id: string | null;
    world_id: string | null;
    flag_reason: string;
    description: string | null;
    status: string;
    resolution: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    created_at: string;
  },
): ContentFlag {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    contentType: row.content_type,
    contentId: row.content_id,
    chatId: row.chat_id,
    worldId: row.world_id,
    flagReason: row.flag_reason,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}
