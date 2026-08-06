/**
 * NPC Navigation Service
 *
 * Manages NPC autonomous movement, pathfinding, and location-based behavior.
 * Builds on the existing npc_states table with location_id tracking.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";

function getLog() {
  return getLogger().child({ module: "npc-navigation", },);
}

/** NPC movement pattern types */
export const MovementPattern = {
  Stationary: "stationary",
  Patrol: "patrol",
  Wander: "wander",
  Follow: "follow",
  Flee: "flee",
  Custom: "custom",
} as const;
export type MovementPattern = (typeof MovementPattern)[keyof typeof MovementPattern];

/** NPC movement state */
export interface NpcMovementState {
  actorId: string;
  worldId: string;
  currentLocationId: string | null;
  targetLocationId: string | null;
  movementPattern: MovementPattern;
  patrolRoute: string[]; // location IDs in order
  patrolIndex: number;
  wanderRadius: number; // max locations away
  followTargetId: string | null;
  speed: number; // locations per tick
  lastMovedAt: string | null;
  metadata: Record<string, unknown>;
}

/** Movement result */
export interface MovementResult {
  success: boolean;
  fromLocationId: string | null;
  toLocationId: string | null;
  pattern: MovementPattern;
  errors: string[];
}

/** Location connection for pathfinding */
export interface LocationConnection {
  fromId: string;
  toId: string;
  cost: number; // travel time/difficulty
  bidirectional: boolean;
}

/** NPC Navigation Service */
export class NpcNavigationService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get NPC movement state from npc_states table
   */
  async getMovementState(actorId: string, worldId: string,): Promise<NpcMovementState | null> {
    const state = await this.db
      .selectFrom("npc_states",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .select(["actor_id", "world_id", "location_id", "schedule",],)
      .executeTakeFirst();

    if (!state) { return null; }

    const schedule = this.parseSchedule(state.schedule,);

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
  async updateMovementState(
    actorId: string,
    worldId: string,
    updates: Partial<NpcMovementState>,
  ): Promise<void> {
    const current = await this.getMovementState(actorId, worldId,);
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

    await this.db
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

  /**
   * Set NPC movement pattern
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
    await this.updateMovementState(actorId, worldId, {
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
  async moveToLocation(
    actorId: string,
    worldId: string,
    targetLocationId: string,
  ): Promise<MovementResult> {
    const state = await this.getMovementState(actorId, worldId,);
    if (!state) {
      return {
        success: false,
        fromLocationId: null,
        toLocationId: targetLocationId,
        pattern: MovementPattern.Stationary,
        errors: ["NPC state not found",],
      };
    }

    const fromLocationId = state.currentLocationId;

    // Update location
    await this.updateMovementState(actorId, worldId, {
      currentLocationId: targetLocationId,
      lastMovedAt: new Date().toISOString(),
    },);

    getLog().info("NPC moved", { actorId, from: fromLocationId, to: targetLocationId, },);

    return {
      success: true,
      fromLocationId,
      toLocationId: targetLocationId,
      pattern: state.movementPattern,
      errors: [],
    };
  }

  /**
   * Process NPC movement tick — advance NPCs based on their movement patterns
   */
  async processMovementTick(worldId: string,): Promise<MovementResult[]> {
    const results: MovementResult[] = [];

    // Get all NPCs in the world
    const npcs = await this.db
      .selectFrom("npc_states",)
      .where("world_id", "=", worldId,)
      .select(["actor_id", "location_id", "schedule",],)
      .execute();

    for (const npc of npcs) {
      const schedule = this.parseSchedule(npc.schedule,);
      const pattern = schedule.movementPattern ?? MovementPattern.Stationary;

      if (pattern === MovementPattern.Stationary) { continue; }

      const result = await this.processNpcMovement(
        npc.actor_id,
        worldId,
        npc.location_id,
        schedule,
      );

      if (result) { results.push(result,); }
    }

    return results;
  }

  /**
   * Process individual NPC movement based on pattern
   */
  private async processNpcMovement(
    actorId: string,
    worldId: string,
    currentLocationId: string | null,
    schedule: Record<string, unknown>,
  ): Promise<MovementResult | null> {
    const pattern = (schedule.movementPattern as string) ?? MovementPattern.Stationary;

    switch (pattern) {
      case MovementPattern.Patrol: {
        return this.processPatrolMovement(actorId, worldId, currentLocationId, schedule,);
      }

      case MovementPattern.Wander: {
        return this.processWanderMovement(actorId, worldId, currentLocationId, schedule,);
      }

      case MovementPattern.Follow: {
        return this.processFollowMovement(actorId, worldId, currentLocationId, schedule,);
      }

      case MovementPattern.Flee: {
        return this.processFleeMovement(actorId, worldId, currentLocationId, schedule,);
      }

      default: {
        return null;
      }
    }
  }

  /**
   * Process patrol movement — follow patrol route
   */
  private async processPatrolMovement(
    actorId: string,
    worldId: string,
    currentLocationId: string | null,
    schedule: Record<string, unknown>,
  ): Promise<MovementResult | null> {
    const route = (schedule.patrolRoute as string[]) ?? [];
    const index = (schedule.patrolIndex as number) ?? 0;

    if (route.length === 0) { return null; }

    const nextIndex = (index + 1) % route.length;
    const nextLocationId = route[nextIndex];

    if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

    await this.updateMovementState(actorId, worldId, {
      currentLocationId: nextLocationId,
      patrolIndex: nextIndex,
      lastMovedAt: new Date().toISOString(),
    },);

    return {
      success: true,
      fromLocationId: currentLocationId,
      toLocationId: nextLocationId,
      pattern: MovementPattern.Patrol,
      errors: [],
    };
  }

  /**
   * Process wander movement — random movement within radius
   */
  private async processWanderMovement(
    actorId: string,
    worldId: string,
    currentLocationId: string | null,
    _schedule: Record<string, unknown>,
  ): Promise<MovementResult | null> {
    if (!currentLocationId) { return null; }

    // Get connected locations
    const connections = await this.getLocationConnections(currentLocationId,);

    if (connections.length === 0) { return null; }

    // Pick random connected location
    const randomIndex = Math.floor(Math.random() * connections.length,);
    const nextLocationId = connections[randomIndex];

    if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

    await this.updateMovementState(actorId, worldId, {
      currentLocationId: nextLocationId,
      lastMovedAt: new Date().toISOString(),
    },);

    return {
      success: true,
      fromLocationId: currentLocationId,
      toLocationId: nextLocationId,
      pattern: MovementPattern.Wander,
      errors: [],
    };
  }

  /**
   * Process follow movement — follow target NPC/player
   */
  private async processFollowMovement(
    actorId: string,
    worldId: string,
    currentLocationId: string | null,
    schedule: Record<string, unknown>,
  ): Promise<MovementResult | null> {
    const followTargetId = schedule.followTargetId as string | null;
    if (!followTargetId) { return null; }

    // Get target's current location
    const targetState = await this.db
      .selectFrom("npc_states",)
      .where("actor_id", "=", followTargetId,)
      .where("world_id", "=", worldId,)
      .select("location_id",)
      .executeTakeFirst();

    if (!targetState?.location_id || targetState.location_id === currentLocationId) {
      return null;
    }

    await this.updateMovementState(actorId, worldId, {
      currentLocationId: targetState.location_id,
      lastMovedAt: new Date().toISOString(),
    },);

    return {
      success: true,
      fromLocationId: currentLocationId,
      toLocationId: targetState.location_id,
      pattern: MovementPattern.Follow,
      errors: [],
    };
  }

  /**
   * Process flee movement — move away from threat
   */
  private async processFleeMovement(
    actorId: string,
    worldId: string,
    currentLocationId: string | null,
    _schedule: Record<string, unknown>,
  ): Promise<MovementResult | null> {
    if (!currentLocationId) { return null; }

    // Get connected locations
    const connections = await this.getLocationConnections(currentLocationId,);

    if (connections.length === 0) { return null; }

    // Pick random connected location (flee to any direction)
    const randomIndex = Math.floor(Math.random() * connections.length,);
    const nextLocationId = connections[randomIndex];

    if (!nextLocationId || nextLocationId === currentLocationId) { return null; }

    await this.updateMovementState(actorId, worldId, {
      currentLocationId: nextLocationId,
      lastMovedAt: new Date().toISOString(),
    },);

    return {
      success: true,
      fromLocationId: currentLocationId,
      toLocationId: nextLocationId,
      pattern: MovementPattern.Flee,
      errors: [],
    };
  }

  /**
   * Get connected locations for pathfinding
   * Uses location_states table to find nearby locations
   */
  private async getLocationConnections(locationId: string,): Promise<string[]> {
    // For now, get all locations in the same world
    // In a real implementation, this would use a connections table or spatial queries
    const location = await this.db
      .selectFrom("location_states",)
      .where("location_id", "=", locationId,)
      .select("world_id",)
      .executeTakeFirst();

    if (!location) { return []; }

    const nearbyLocations = await this.db
      .selectFrom("location_states",)
      .where("world_id", "=", location.world_id,)
      .where("location_id", "!=", locationId,)
      .select("location_id",)
      .limit(5,) // Limit to nearby locations
      .execute();

    return nearbyLocations.map((l,) => l.location_id).filter(Boolean,);
  }

  /**
   * Parse schedule JSON from npc_states
   */
  private parseSchedule(raw: string | null,): Record<string, unknown> {
    if (!raw) { return {}; }
    return jsonParseOr(raw, {},);
  }
}
