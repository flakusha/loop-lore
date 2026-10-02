// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 267

/**
 * NPC movement processing — tick dispatch and per-pattern movement logic
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { toDate, } from "../../../utils/date";
import { getLocationConnections, } from "./pathfinding";
import { parseSchedule, updateMovementState, } from "./state";
import type { MovementResult, } from "./types";
import { MovementPattern, } from "./types";

/** Options for a movement tick. Every field is optional so existing
 *  callers (`story/game-master/execute`, the HTTP route) stay source
 *  compatible. A seeded tick is fully reproducible: `rng` drives
 *  destination choice and `nowMs` drives every `lastMovedAt` stamp.
 */
export interface MovementTickOptions {
  /** Injected RNG for destination choice. Defaults to Math.random. */
  rng?: () => number;
  /** Injected clock for lastMovedAt stamps. Defaults to Date.now. */
  nowMs?: number;
}

/** Tick context handed to the leaves with defaults already resolved —
 *  one default-resolution site per tick, no leaf re-resolves. */
interface TickCtx {
  rng: () => number;
  nowMs: number;
}

/** Process NPC movement tick — advance NPCs based on their movement patterns. */
export async function processMovementTick(
  db: Kysely<DB>,
  worldId: string,
  opts: MovementTickOptions = {},
): Promise<MovementResult[]> {
  const ctx: TickCtx = {
    rng: opts.rng ?? Math.random,
    nowMs: opts.nowMs ?? Date.now(),
  };
  const results: MovementResult[] = [];

  // Get all NPCs in the world
  const npcs = await db
    .selectFrom("npc_states",)
    .where("world_id", "=", worldId,)
    .select(["actor_id", "location_id", "schedule",],)
    .execute();

  for (const npc of npcs) {
    const schedule = parseSchedule(npc.schedule,);
    const pattern = schedule.movementPattern ?? MovementPattern.Stationary;

    if (pattern === MovementPattern.Stationary) { continue; }

    const result = await processNpcMovement(
      db,
      npc.actor_id,
      worldId,
      npc.location_id,
      schedule,
      ctx,
    );

    if (result) {
      result.actorId = npc.actor_id;
      results.push(result,);
    }
  }

  return results;
}

/** Process individual NPC movement based on pattern. */
export async function processNpcMovement(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currentLocationId: string | null,
  schedule: Record<string, unknown>,
  ctx: TickCtx,
): Promise<MovementResult | null> {
  const pattern = (schedule.movementPattern as string) ?? MovementPattern.Stationary;

  switch (pattern) {
    case MovementPattern.Patrol: {
      return processPatrolMovement(db, actorId, worldId, currentLocationId, schedule, ctx,);
    }

    case MovementPattern.Wander: {
      return processWanderMovement(db, actorId, worldId, currentLocationId, schedule, ctx,);
    }

    case MovementPattern.Follow: {
      return processFollowMovement(db, actorId, worldId, currentLocationId, schedule, ctx,);
    }

    case MovementPattern.Flee: {
      return processFleeMovement(db, actorId, worldId, currentLocationId, schedule, ctx,);
    }

    default: {
      return null;
    }
  }
}

/** Process patrol movement — follow patrol route. */
export async function processPatrolMovement(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currentLocationId: string | null,
  schedule: Record<string, unknown>,
  ctx: TickCtx,
): Promise<MovementResult | null> {
  const route = (schedule.patrolRoute as string[]) ?? [];
  const index = (schedule.patrolIndex as number) ?? 0;

  if (route.length === 0) { return null; }

  const nextIndex = (index + 1) % route.length;
  const nextLocationId = route[nextIndex];

  if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

  await updateMovementState(db, actorId, worldId, {
    currentLocationId: nextLocationId,
    patrolIndex: nextIndex,
    lastMovedAt: toDate(ctx.nowMs,).toISOString(),
  }, ctx.nowMs,);

  return {
    success: true,
    fromLocationId: currentLocationId,
    toLocationId: nextLocationId,
    pattern: MovementPattern.Patrol,
    errors: [],
  };
}

/** Process wander movement — random movement within radius. */
export async function processWanderMovement(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currentLocationId: string | null,
  _schedule: Record<string, unknown>,
  ctx: TickCtx,
): Promise<MovementResult | null> {
  if (!currentLocationId) { return null; }

  // Get connected locations
  const connections = await getLocationConnections(db, currentLocationId,);

  if (connections.length === 0) { return null; }

  // Pick random connected location
  const randomIndex = Math.floor(ctx.rng() * connections.length,);
  const nextLocationId = connections[randomIndex];

  if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

  await updateMovementState(db, actorId, worldId, {
    currentLocationId: nextLocationId,
    lastMovedAt: toDate(ctx.nowMs,).toISOString(),
  }, ctx.nowMs,);

  return {
    success: true,
    fromLocationId: currentLocationId,
    toLocationId: nextLocationId,
    pattern: MovementPattern.Wander,
    errors: [],
  };
}

/** Process follow movement — follow target NPC/player. */
export async function processFollowMovement(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currentLocationId: string | null,
  schedule: Record<string, unknown>,
  ctx: TickCtx,
): Promise<MovementResult | null> {
  const followTargetId = schedule.followTargetId as string | null;
  if (!followTargetId) { return null; }

  // Get target's current location
  const targetState = await db
    .selectFrom("npc_states",)
    .where("actor_id", "=", followTargetId,)
    .where("world_id", "=", worldId,)
    .select("location_id",)
    .executeTakeFirst();

  if (!targetState?.location_id || targetState.location_id === currentLocationId) {
    return null;
  }

  await updateMovementState(db, actorId, worldId, {
    currentLocationId: targetState.location_id,
    lastMovedAt: toDate(ctx.nowMs,).toISOString(),
  }, ctx.nowMs,);

  return {
    success: true,
    fromLocationId: currentLocationId,
    toLocationId: targetState.location_id,
    pattern: MovementPattern.Follow,
    errors: [],
  };
}

/** Process flee movement — move away from threat. */
export async function processFleeMovement(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currentLocationId: string | null,
  _schedule: Record<string, unknown>,
  ctx: TickCtx,
): Promise<MovementResult | null> {
  if (!currentLocationId) { return null; }

  // Get connected locations
  const connections = await getLocationConnections(db, currentLocationId,);

  if (connections.length === 0) { return null; }

  // Pick random connected location (flee to any direction)
  const randomIndex = Math.floor(ctx.rng() * connections.length,);
  const nextLocationId = connections[randomIndex];

  if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

  await updateMovementState(db, actorId, worldId, {
    currentLocationId: nextLocationId,
    lastMovedAt: toDate(ctx.nowMs,).toISOString(),
  }, ctx.nowMs,);

  return {
    success: true,
    fromLocationId: currentLocationId,
    toLocationId: nextLocationId,
    pattern: MovementPattern.Flee,
    errors: [],
  };
}
