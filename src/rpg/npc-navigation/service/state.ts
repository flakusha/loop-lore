import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import { MovementPattern, } from "./types";
import type { NpcMovementState, } from "./types";

/**
 * Parse schedule JSON from npc_states
 */
export function parseSchedule(raw: string | null,): Record<string, unknown> {
  if (!raw) { return {}; }
  return jsonParseOr(raw, {},);
}

/**
 * Get NPC movement state from npc_states table
 */
export async function getMovementState(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
): Promise<NpcMovementState | null> {
  const state = await db
    .selectFrom("npc_states",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .select(["actor_id", "world_id", "location_id", "schedule",],)
    .executeTakeFirst();

  if (!state) { return null; }

  const schedule = parseSchedule(state.schedule,);

  return {
    actorId: state.actor_id,
    worldId: state.world_id,
    currentLocationId: state.location_id,
    targetLocationId: (schedule.targetLocationId as string) ?? null,
    movementPattern: (schedule.movementPattern as MovementPattern) ?? MovementPattern.Stationary,
    patrolRoute: (schedule.patrolRoute as string[]) ?? [],
    patrolIndex: (schedule.patrolIndex as number) ?? 0,
    wanderRadius: (schedule.wanderRadius as number) ?? 1,
    followTargetId: (schedule.followTargetId as string) ?? null,
    speed: (schedule.speed as number) ?? 1,
    lastMovedAt: (schedule.lastMovedAt as string) ?? null,
    metadata: (schedule.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Update NPC movement state
 */
export async function updateMovementState(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  updates: Partial<NpcMovementState>,
): Promise<void> {
  const current = await getMovementState(db, actorId, worldId,);
  if (!current) { throw new Error("NPC state not found",); }

  const schedule = {
    movementPattern: updates.movementPattern ?? current.movementPattern,
    patrolRoute: updates.patrolRoute ?? current.patrolRoute,
    patrolIndex: updates.patrolIndex ?? current.patrolIndex,
    wanderRadius: updates.wanderRadius ?? current.wanderRadius,
    followTargetId: updates.followTargetId ?? current.followTargetId,
    speed: updates.speed ?? current.speed,
    lastMovedAt: updates.lastMovedAt ?? current.lastMovedAt,
    targetLocationId: updates.targetLocationId ?? current.targetLocationId,
    metadata: updates.metadata ?? current.metadata,
  };

  await db
    .updateTable("npc_states",)
    .set({
      location_id: updates.currentLocationId ?? current.currentLocationId,
      schedule: jsonStringifyOr(schedule,),
      updated_at: new Date().toISOString(),
    },)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .execute();
}
