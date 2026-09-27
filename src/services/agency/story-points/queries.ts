// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points — read-only queries. Pure-Kysely SQL.
 *
 * @module services/agency/story-points/queries
 */
import type { Kysely, } from "kysely";
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
    // Synthesize a zero snapshot WITHOUT writing: this function backs the
    // GET /api/agency/balance read endpoint, and a side-effecting read both
    // mutates the DB on GET and races concurrent first reads into a raw
    // UNIQUE violation (BUG-getstorypointbalance-mutates-db-on-read-and-500s-).
    // The row is created by earn/spend when the actor first transacts.
    return {
      actor_id: actorId,
      world_id: worldKey,
      balance: 0,
      earned_total: 0,
      spent_total: 0,
      cap: null,
      updated_at: new Date().toISOString().slice(0, 19,).replace("T", " ",),
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
