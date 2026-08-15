/** Achievement categories */
import type { PlayerAchievementStatus, } from "../../../db/enums";

export const AchievementCategory = {
  Story: "story",
  Combat: "combat",
  Exploration: "exploration",
  Social: "social",
  Crafting: "crafting",
  Collection: "collection",
  Mastery: "mastery",
  Secret: "secret",
} as const;
export type AchievementCategory = (typeof AchievementCategory)[keyof typeof AchievementCategory];

/** Achievement tiers */
export const AchievementTier = {
  Bronze: "bronze",
  Silver: "silver",
  Gold: "gold",
  Platinum: "platinum",
  Diamond: "diamond",
} as const;
export type AchievementTier = (typeof AchievementTier)[keyof typeof AchievementTier];

/** Achievement definition */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon: string | null;
  isSecret: boolean;
  isHidden: boolean;
  unlockCondition: UnlockCondition;
  rewards: AchievementReward[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Unlock condition types */
export interface UnlockCondition {
  type: "simple" | "compound" | "counter" | "streak";
  target?: string; // what to track
  count?: number; // how many needed
  conditions?: UnlockCondition[]; // for compound
  operator?: "and" | "or"; // for compound
}

/** Achievement reward */
export interface AchievementReward {
  type: "experience" | "item" | "currency" | "title" | "cosmetic" | "unlock";
  value: unknown;
  description: string;
}

/** Player achievement progress */
export interface PlayerAchievement {
  id: string;
  playerId: string;
  achievementId: string;
  progress: number;
  maxProgress: number;
  status: PlayerAchievementStatus;
  /** Derived from status — true when unlocked or claimed. */
  isUnlocked: boolean;
  unlockedAt: string | null;
  claimedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Achievement creation input */
export interface CreateAchievementInput {
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon?: string;
  isSecret?: boolean;
  isHidden?: boolean;
  unlockCondition: UnlockCondition;
  rewards?: AchievementReward[];
  metadata?: Record<string, unknown>;
}

/** Achievement update input */
export interface UpdateAchievementInput {
  name?: string;
  description?: string;
  category?: AchievementCategory;
  tier?: AchievementTier;
  icon?: string | null;
  isSecret?: boolean;
  isHidden?: boolean;
  unlockCondition?: UnlockCondition;
  rewards?: AchievementReward[];
  metadata?: Record<string, unknown>;
}

/** Progress update result */
export interface ProgressUpdateResult {
  achievementId: string;
  playerId: string;
  oldProgress: number;
  newProgress: number;
  unlocked: boolean;
  rewards: AchievementReward[];
}
