import type { QuestStatus, QuestType, } from "../../../db/enums-story";

/** Quest data from the database */
export interface QuestRow {
  id: string;
  world_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  priority: number;
  config: string;
  progress: number;
  target: number;
  start_time: string | null;
  deadline: string | null;
  time_location_id: string | null;
  rewards: string;
  narrative_hooks: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Quest objective definition */
export interface QuestObjective {
  id: string;
  type: "kill" | "collect" | "talk" | "explore" | "craft" | "custom";
  target: string;
  count: number;
  current: number;
  completed: boolean;
}

/** Quest reward definition */
export interface QuestReward {
  type: "experience" | "item" | "currency" | "reputation" | "unlock";
  value: unknown;
  claimed: boolean;
}

/** Quest creation input */
export interface CreateQuestInput {
  world_id: string;
  creator_id: string;
  name: string;
  description?: string;
  type?: QuestType;
  priority?: number;
  target?: number;
  objectives?: QuestObjective[];
  rewards?: QuestReward[];
  deadline?: string;
  time_location_id?: string;
}

/** Quest update input */
export interface UpdateQuestInput {
  name?: string;
  description?: string;
  type?: QuestType;
  priority?: number;
  target?: number;
  deadline?: string;
  time_location_id?: string;
}

/** Quest state transition result */
export interface QuestTransitionResult {
  success: boolean;
  from: QuestStatus;
  to: QuestStatus;
  quest: QuestRow;
  errors: string[];
}
