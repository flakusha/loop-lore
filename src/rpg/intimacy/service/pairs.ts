import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, uid, } from "../../../utils";
import type { IntimacyPair, } from "./types";

/** Convert a DB row to an IntimacyPair. */
export function rowToPair(row: {
  id: string;
  actor_id: string;
  target_actor_id: string;
  world_id: string | null;
  score: number;
  action_history: string;
  unlocked_thresholds: string;
  created_at: string;
  updated_at: string;
},): IntimacyPair {
  return {
    id: row.id,
    actorId: row.actor_id,
    targetActorId: row.target_actor_id,
    worldId: row.world_id,
    score: row.score,
    actionHistory: jsonParseOr(row.action_history, [],),
    unlockedThresholds: jsonParseOr(row.unlocked_thresholds, [],),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get or create an intimacy pair between two actors.
 * Intimacy is symmetric — (A,B) and (B,A) share the same score.
 */
export async function getPair(
  db: Kysely<DB>,
  actorId: string,
  targetActorId: string,
  worldId: string | null = null,
): Promise<IntimacyPair> {
  const row = await db
    .selectFrom("character_intimacy",)
    .where("actor_id", "=", actorId,)
    .where("target_actor_id", "=", targetActorId,)
    .where("world_id", "is", worldId,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToPair(row,);
  }

  // Create new pair with score 0
  const now = new Date().toISOString();
  const id = uid();

  await db
    .insertInto("character_intimacy",)
    .values({
      id,
      actor_id: actorId,
      target_actor_id: targetActorId,
      world_id: worldId,
      score: 0,
      action_history: "[]",
      unlocked_thresholds: "[]",
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    targetActorId,
    worldId,
    score: 0,
    actionHistory: [],
    unlockedThresholds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get all intimacy pairs for an actor (optionally in a world).
 */
export async function getActorPairs(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string | null,
): Promise<IntimacyPair[]> {
  let query = db
    .selectFrom("character_intimacy",)
    .where("actor_id", "=", actorId,)
    .orderBy("score", "desc",);

  if (worldId !== undefined && worldId !== null) {
    query = query.where("world_id", "=", worldId,);
  } else if (worldId === null) {
    query = query.where("world_id", "is", null,);
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (r,) => rowToPair(r,),);
}
