// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points — read-only queries. Pure-Kysely SQL.
 *
 * @module services/agency/story-points/queries
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../../db";
import type { StoryPointBalance, } from "./types";

/**
 * Get the current balance for an (actor, world) tuple, creating a zero row
 * if absent. `worldId === null` resolves to the cross-world global row.
 */
export async function getStoryPointBalance(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string | null,
): Promise<StoryPointBalance> {
  const worldKey = worldId ?? null;
  const existing = await db
    .selectFrom("actor_story_points",)
    .select(["actor_id", "world_id", "balance", "earned_total", "spent_total", "cap", "updated_at",],)
    .where("actor_id", "=", actorId,)
    .where("world_id", "is", worldKey,)
    .executeTakeFirst();

  if (existing === undefined) {
    // Insert a zero row, then re-read (NULL world_id doesn't collapse via
    // UNIQUE so we cannot rely on ON CONFLICT).
    await sql`
      INSERT INTO actor_story_points (id, actor_id, world_id, balance, earned_total, spent_total, cap, created_at, updated_at)
      VALUES (lower(hex(randomblob(16))), ${actorId}, ${worldKey}, 0, 0, 0, NULL, datetime('now'), datetime('now'))
    `.execute(db,);
    const inserted = await db
      .selectFrom("actor_story_points",)
      .select(["actor_id", "world_id", "balance", "earned_total", "spent_total", "cap", "updated_at",],)
      .where("actor_id", "=", actorId,)
      .where("world_id", "is", worldKey,)
      .executeTakeFirstOrThrow();
    return {
      actor_id: inserted.actor_id,
      world_id: inserted.world_id,
      balance: inserted.balance,
      earned_total: inserted.earned_total,
      spent_total: inserted.spent_total,
      cap: inserted.cap,
      updated_at: inserted.updated_at,
    };
  }

  return {
    actor_id: existing.actor_id,
    world_id: existing.world_id,
    balance: existing.balance,
    earned_total: existing.earned_total,
    spent_total: existing.spent_total,
    cap: existing.cap,
    updated_at: existing.updated_at,
  };
}
