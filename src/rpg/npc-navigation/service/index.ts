// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Navigation Service
 *
 * Manages NPC autonomous movement, pathfinding, and location-based behavior.
 * Builds on the existing npc_states table with location_id tracking.
 *
 * The movement/state/pathfinding logic lives in isolated dispatcher modules
 * (state, movement, processing, pathfinding) threaded with an explicit `db`
 * handle. `NpcNavigationService` remains a class so its methods stay on the
 * prototype.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import {
  moveToLocation as moveToLocationDispatch,
  setMovementPattern as setMovementPatternDispatch,
} from "./movement";
import { processMovementTick as processMovementTickDispatch, } from "./processing";
import {
  getMovementState as getMovementStateDispatch,
  updateMovementState as updateMovementStateDispatch,
} from "./state";
import type { MovementPattern, MovementResult, NpcMovementState, } from "./types";

export { MovementPattern, } from "./types";
export type {
  LocationConnection,
  MovementResult,
  NpcMovementState,
} from "./types";

/**
 * NPC Navigation Service
 *
 * Manages NPC autonomous movement, pathfinding, and location-based behavior.
 */
export class NpcNavigationService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get NPC movement state from npc_states table
   * @param actorId
   * @param worldId
   */
  async getMovementState(actorId: string, worldId: string,): Promise<NpcMovementState | null> {
    return getMovementStateDispatch(this.db, actorId, worldId,);
  }

  /**
   * Update NPC movement state
   * @param actorId
   * @param worldId
   * @param updates
   */
  async updateMovementState(
    actorId: string,
    worldId: string,
    updates: Partial<NpcMovementState>,
  ): Promise<void> {
    return updateMovementStateDispatch(this.db, actorId, worldId, updates,);
  }

  /**
   * Set NPC movement pattern
   * @param actorId
   * @param worldId
   * @param pattern
   * @param config
   * @param config.patrolRoute
   * @param config.wanderRadius
   * @param config.followTargetId
   * @param config.speed
   */
  async setMovementPattern(
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
    return setMovementPatternDispatch(this.db, actorId, worldId, pattern, config,);
  }

  /**
   * Move NPC to a specific location
   * @param actorId
   * @param worldId
   * @param targetLocationId
   */
  async moveToLocation(
    actorId: string,
    worldId: string,
    targetLocationId: string,
  ): Promise<MovementResult> {
    return moveToLocationDispatch(this.db, actorId, worldId, targetLocationId,);
  }

  /**
   * Process NPC movement tick — advance NPCs based on their movement patterns
   * @param worldId
   */
  async processMovementTick(worldId: string,): Promise<MovementResult[]> {
    return processMovementTickDispatch(this.db, worldId,);
  }
}
