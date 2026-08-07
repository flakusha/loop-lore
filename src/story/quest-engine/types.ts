/**
 * Quest Engine Service — Types
 *
 * Progress entry type and shared dispatcher state.
 */
import type { Kysely, } from "kysely";
import type { QuestType as QT, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { ItemsService, } from "../items";
import type { WorldStateService, } from "../world-state";

// ── Progress Entry ───────────────────────────────────────────

export interface QuestProgressEntry {
  questId: string;
  questName: string;
  questType: QT;
  previousProgress: number;
  newProgress: number;
  target: number;
  delta: number;
  milestoneHit: string | null;
  completed: boolean;
}

// ── Shared dispatcher state ─────────────────────────────────

/** Mutable view of the quest engine's dependencies threaded to dispatchers */
export interface QuestState {
  db: Kysely<DB>;
  worldState?: WorldStateService;
  items?: ItemsService;
}

// ── Row shapes used by dispatchers ─────────────────────────

export interface QuestRow {
  id: string;
  world_id: string;
  type: string;
  config: string;
  progress: number;
  target: number;
  name: string;
  narrative_hooks: string;
  rewards: string;
}

export interface ProgressQuestRow {
  id: string;
  world_id: string;
  type: string;
  config: string;
  progress: number;
  target: number;
  name: string;
  narrative_hooks: string;
  rewards: string;
}
