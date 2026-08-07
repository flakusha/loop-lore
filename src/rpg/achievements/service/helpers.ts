import { getLogger, } from "../../../logger";
import { jsonParseOr, } from "../../../utils";
import type {
  Achievement,
  AchievementReward,
  PlayerAchievement,
  UnlockCondition,
} from "./types";

export function getLog() {
  return getLogger().child({ module: "achievements", },);
}

/**
 * Parse JSON field safely
 */
export function parseJsonField<T,>(raw: unknown, fallback: T,): T {
  if (typeof raw !== "string") { return fallback; }
  return jsonParseOr(raw, fallback,);
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
    isUnlocked: row.is_unlocked,
    unlockedAt: row.unlocked_at,
    claimedAt: row.claimed_at,
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
