// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * NSFW Moderation Service — content flags
 *
 * Flagging content, reading the review queue, and resolving flags.
 * Projections, mapper, reporter hash, and validation limits live in
 * `./flags-views`; this file only carries the state-changing actions.
 */
import type { ContentFlag, NsfwModerationServiceContext, } from "./types";
// Local helpers — projections, mapper, reporter hash, and limit helpers
// are implemented in `./flags-views`; we re-export them below to preserve
// the existing public surface for callers across the codebase.
import { checkDescriptionLength, mapFlag, } from "./flags-views";
// Re-export the projection/mapper/reporter-hash/limit helpers so the
// existing public surface (`flagsRoutes`, `mod-actions`, admin UI) is
// unchanged. The implementations now live in `./flags-views.ts`.
export {
  checkDescriptionLength,
  clampFlagLimit,
  type FlagQueueView,
  hashReporterId,
  mapFlag,
  type ResolvedFlagView,
  resolveReporterHashSecret,
  toQueueView,
  toResolvedView,
} from "./flags-views";

/** */
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

/**
 * Submit a content flag for review.
 * @param root0
 * @param root0.thisL
 * @param root0.params
 */
export async function flagContent({ thisL, params, }: FlagContentArgs,): Promise<ContentFlag> {
  // BUG-flagcontent-toctou: race-free dedup via partial UNIQUE INDEX.
  // Migration 018 adds content_flags_open_unique(content_type, content_id)
  // WHERE status IN ('pending','under_review'). Two concurrent inserts with
  // the same content fail the second with UNIQUE violation; the pre-insert
  // SELECT is gone so no window exists where both callers pass.
  checkDescriptionLength(params.description,);
  const dismissedCount = await thisL.db.selectFrom("content_flags",).where("reporter_id", "=", params.reporterId,)
    .where("status", "=", "dismissed",).select(({ fn, },) => fn.count<number>("id",).as("count",)).executeTakeFirst();
  if (dismissedCount && dismissedCount.count >= 3) {
    thisL.log.warn("Reporter has 3+ dismissed flags", { reporterId: params.reporterId, },);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
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
  } catch (err) {
    if (isUniqueViolation(err,)) {
      throw new Error("Content already flagged for review.",);
    }
    throw err;
  }

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

/**
 * Detect SQLite UNIQUE constraint violation (race-loser path for flagContent).
 * @param err
 */
function isUniqueViolation(err: unknown,): boolean {
  const msg = err instanceof Error ? err.message : String(err,);
  return /UNIQUE constraint failed/i.test(msg,) || /constraint failed/i.test(msg,);
}

/** */
export interface GetFlagQueueArgs {
  thisL: NsfwModerationServiceContext;
  params?: { status?: string; limit?: number; offset?: number };
}

/**
 * Read a page of flags filtered by status, plus the total count.
 * @param root0
 * @param root0.thisL
 * @param root0.params
 */
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

/** */
export interface ResolveFlagArgs {
  thisL: NsfwModerationServiceContext;
  flagId: string;
  resolvedBy: string;
  resolution: string;
  status: "resolved" | "dismissed" | "confirmed";
}

/**
 * Resolve a flag with a disposition and resolution note.
 * @param root0
 * @param root0.thisL
 * @param root0.flagId
 * @param root0.resolvedBy
 * @param root0.resolution
 * @param root0.status
 */
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

// (projections, mapper, reporter-hash, and limit helpers moved to
// ./flags-views; this module re-exports them above to preserve the
// existing public surface for callers across the codebase.)
