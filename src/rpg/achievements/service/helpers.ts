import type { Logger, } from "../../../logger";
import { getRpgLog, parseJsonField, } from "../../shared/rpg-service-utils";
import type {
  Achievement,
  AchievementReward,
  PlayerAchievement,
  UnlockCondition,
} from "./types";

/**
 * Get the achievements module logger.
 * Delegates to the shared RPG logger factory.
 */
export function getLog(): Logger {
  return getRpgLog("achievements",);
}

/**
 * Convert database row to Achievement interface
 */
export function rowToAchievement(row: any,): Achievement {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tier: row.tier,
    icon: row.icon,
    isSecret: row.is_secret,
    isHidden: row.is_hidden,
    unlockCondition: parseJsonField<UnlockCondition>(row.unlock_condition, { type: "simple", },),
    rewards: parseJsonField<AchievementReward[]>(row.rewards, [],),
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to PlayerAchievement interface
 */
export function rowToPlayerAchievement(row: any,): PlayerAchievement {
  return {
    id: row.id,
    playerId: row.player_id,
    achievementId: row.achievement_id,
    progress: row.progress,
    maxProgress: row.max_progress,
    status: row.status,
    isUnlocked: row.status === "unlocked" || row.status === "claimed",
    unlockedAt: row.unlocked_at,
    claimedAt: row.claimed_at,
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
