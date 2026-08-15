/**
 * Story Feature Types — World Events & State Shapes
 *
 * Break circular dependency between story-types and quest-types.
 * Leaf node — no imports from other story type modules.
 */
import type { WorldEventType as WET, } from "../db/enums";
import type { ItemInstance, } from "./items/types";

// ─── World Events ────────────────────────────────────────────────
export interface WorldEvent {
  type: WET;
  actorId?: string;
  locationId?: string;
  timestamp: string;
  data: Record<string, unknown>;
  description: string;
}

export interface NpcState {
  health: number;
  mental_state: string;
  knowledge: Record<string, { fact: string; confidence: number; source: string }>;
  relationships: Record<string, number>;
  inventory: ItemInstance[];
  schedule: Record<string, { action: string; locationId?: string }>;
  /** NPC autonomous movement pattern (stationary, patrol, wander, follow, flee) */
  movementPattern?: string;
  /** Current movement target location (for follow/flee/patrol) */
  movementTarget?: string | null;
}

export interface LocationState {
  description_override: string | null;
  atmosphere: string | null;
  npcs_present: string[];
  items_available: string[];
  time_of_day: string | null;
  weather: string | null;
  hazards: string[];
}
