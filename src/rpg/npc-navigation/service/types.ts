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
  /** Set by processMovementTick — individual movement fns may omit it */
  actorId?: string;
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
