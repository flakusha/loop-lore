/**
 * Story Feature Types — Quest Domain
 *
 * Quest configs, rewards, and creation/progress request types.
 */
import type { QuestType as QT, } from "../db/enums";
import type { WorldEvent, } from "./story-events-types";

// ─── Quest Configs ───────────────────────────────────────────────
export interface BaseQuestConfig {
  type: QT;
}

export interface TimeQuestConfig extends BaseQuestConfig {
  type: "time";
  durationMinutes: number;
  trackInGameTime: boolean;
  locationId?: string;
  milestones: { progress: number; narrative: string }[];
}

export interface CollectionQuestConfig extends BaseQuestConfig {
  type: "collection";
  items?: { itemId: string; quantity: number }[];
  category?: string;
  categoryQuantity?: number;
  sources: string[];
}

export interface DestructionQuestConfig extends BaseQuestConfig {
  type: "destruction";
  targetActorId?: string;
  targetType?: string;
  targetQuantity?: number;
  combatRules?: {
    hpMultiplier: number;
    specialWeaknesses: string[];
  };
}

export interface RescueQuestConfig extends BaseQuestConfig {
  type: "rescue";
  targetActorId: string;
  safeLocationId: string;
  escortRequired: boolean;
  timeLimitMinutes?: number;
  threats: string[];
}

export interface DiscoveryQuestConfig extends BaseQuestConfig {
  type: "discovery";
  targetLocationId?: string;
  discoveryType?: "location" | "secret" | "lore" | "path";
  clues: { locationId: string; hint: string }[];
  revealOnComplete: string;
}

export interface SocialQuestConfig extends BaseQuestConfig {
  type: "social";
  targetActorId: string;
  targetDisposition: number;
  requiredInteractions: number;
  favoredTopics: string[];
  disfavoredActions: string[];
}

export interface CompositeQuestConfig extends BaseQuestConfig {
  type: "composite";
  subQuests: string[];
  logic: "all" | "any" | "sequence";
}

export type QuestConfig =
  | TimeQuestConfig
  | CollectionQuestConfig
  | DestructionQuestConfig
  | RescueQuestConfig
  | DiscoveryQuestConfig
  | SocialQuestConfig
  | CompositeQuestConfig;

// ─── Quest Rewards ───────────────────────────────────────────────
export interface QuestReward {
  xp?: number;
  items?: { itemId: string; quantity: number }[];
  worldChanges?: WorldEvent[];
  loreUnlocks?: string[];
  unlockQuests?: string[];
}

// ─── Quest API Types ─────────────────────────────────────────────
export interface QuestCreateRequest {
  worldId: string;
  creatorId: string;
  name: string;
  description: string | null;
  type: QT;
  config: QuestConfig;
  target: number;
  deadline?: string;
  rewards?: QuestReward;
  narrativeHooks?: { progress: number; narrative: string }[];
}

export interface QuestProgressRequest {
  questId: string;
  chatId: string;
  progressDelta: number;
  sourceMessageId?: string;
}
