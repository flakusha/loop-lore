/**
 * NPC movement commands — set pattern and move to a location
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getRpgLog, } from "../../shared/rpg-service-utils";
import {
  getMovementState,
  updateMovementState,
} from "./state";
import type { MovementResult, } from "./types";
import { MovementPattern, } from "./types";

function getLog() {
  return getRpgLog("npc-navigation",);
}

/**
 * Set NPC movement pattern
 */
export async function setMovementPattern(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  pattern: MovementPattern,
  config?: {
    patrolRoute?: string[];
    wanderRadius?: number;
    followTargetId?: string;
    speed?: number;
  },
): Promise<void> {
  await updateMovementState(db, actorId, worldId, {
    movementPattern: pattern,
    patrolRoute: config?.patrolRoute ?? [],
    wanderRadius: config?.wanderRadius ?? 1,
    followTargetId: config?.followTargetId ?? null,
    speed: config?.speed ?? 1,
  },);

  getLog().info("NPC movement pattern set", { actorId, worldId, pattern, },);
}

/**
 * Move NPC to a specific location
 */
export async function moveToLocation(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  targetLocationId: string,
): Promise<MovementResult> {
  const state = await getMovementState(db, actorId, worldId,);
  if (!state) {
    return {
      success: false,
      actorId,
      fromLocationId: null,
      toLocationId: targetLocationId,
      pattern: MovementPattern.Stationary,
      errors: ["NPC state not found",],
    };
  }

  const fromLocationId = state.currentLocationId;

  // Update location
  await updateMovementState(db, actorId, worldId, {
    currentLocationId: targetLocationId,
    lastMovedAt: new Date().toISOString(),
  },);

  getLog().info("NPC moved", { actorId, from: fromLocationId, to: targetLocationId, },);

  return {
    success: true,
    actorId,
    fromLocationId,
    toLocationId: targetLocationId,
    pattern: state.movementPattern,
    errors: [],
  };
}
