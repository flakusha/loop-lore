/**
 * Achievements Service
 *
 * Manages player achievements, trophies, badges, and milestones.
 * Tracks accomplishments and provides rewards for completion.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";

function getLog() {
  return getLogger().child({ module: "achievements", },);
}

/** Achievement categories */
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

/** Achievements Service */
export class AchievementsService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new achievement definition
   */
  async createAchievement(input: CreateAchievementInput,): Promise<Achievement> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const achievementData = {
      id,
      name: input.name,
      description: input.description,
      category: input.category,
      tier: input.tier,
      icon: input.icon ?? null,
      is_secret: input.isSecret ?? false,
      is_hidden: input.isHidden ?? false,
      unlock_condition: JSON.stringify(input.unlockCondition,),
      rewards: JSON.stringify(input.rewards ?? [],),
      metadata: JSON.stringify(input.metadata ?? {},),
      created_at: now,
      updated_at: now,
    };

    await (this.db as any).insertInto("achievements",).values(achievementData,).execute();

    getLog().info("Achievement created", { id, name: input.name, category: input.category, },);

    return this.rowToAchievement(achievementData,);
  }

  /**
   * Get an achievement by ID
   */
  async getAchievement(achievementId: string,): Promise<Achievement | null> {
    const row = await (this.db as any)
      .selectFrom("achievements",)
      .where("id", "=", achievementId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToAchievement(row,) : null;
  }

  /**
   * List all achievements
   */
  async listAchievements(
    category?: AchievementCategory,
    includeSecret: boolean = false,
  ): Promise<Achievement[]> {
    let query = (this.db as any)
      .selectFrom("achievements",)
      .orderBy("category", "asc",)
      .orderBy("tier", "asc",);

    if (category) {
      query = query.where("category", "=", category,);
    }

    if (!includeSecret) {
      query = query.where("is_secret", "=", false,);
    }

    const rows = await query.selectAll().execute();
    return rows.map((row: any,) => this.rowToAchievement(row,));
  }

  /**
   * Update an achievement
   */
  async updateAchievement(achievementId: string, input: UpdateAchievementInput,): Promise<Achievement> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.name !== undefined) { updates.name = input.name; }
    if (input.description !== undefined) { updates.description = input.description; }
    if (input.category !== undefined) { updates.category = input.category; }
    if (input.tier !== undefined) { updates.tier = input.tier; }
    if (input.icon !== undefined) { updates.icon = input.icon; }
    if (input.isSecret !== undefined) { updates.is_secret = input.isSecret; }
    if (input.isHidden !== undefined) { updates.is_hidden = input.isHidden; }
    if (input.unlockCondition !== undefined) { updates.unlock_condition = JSON.stringify(input.unlockCondition,); }
    if (input.rewards !== undefined) { updates.rewards = JSON.stringify(input.rewards,); }
    if (input.metadata !== undefined) { updates.metadata = JSON.stringify(input.metadata,); }

    await (this.db as any)
      .updateTable("achievements",)
      .set(updates,)
      .where("id", "=", achievementId,)
      .execute();

    return (await this.getAchievement(achievementId,))!;
  }

  /**
   * Delete an achievement
   */
  async deleteAchievement(achievementId: string,): Promise<void> {
    // Delete player progress first
    await (this.db as any)
      .deleteFrom("player_achievements",)
      .where("achievement_id", "=", achievementId,)
      .execute();

    await (this.db as any)
      .deleteFrom("achievements",)
      .where("id", "=", achievementId,)
      .execute();
  }

  /**
   * Get player achievement progress
   */
  async getPlayerAchievement(playerId: string, achievementId: string,): Promise<PlayerAchievement | null> {
    const row = await (this.db as any)
      .selectFrom("player_achievements",)
      .where("player_id", "=", playerId,)
      .where("achievement_id", "=", achievementId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToPlayerAchievement(row,) : null;
  }

  /**
   * Get all achievements for a player
   */
  async getPlayerAchievements(playerId: string,): Promise<PlayerAchievement[]> {
    const rows = await (this.db as any)
      .selectFrom("player_achievements",)
      .where("player_id", "=", playerId,)
      .orderBy("unlocked_at", "desc",)
      .selectAll()
      .execute();

    return rows.map((row: any,) => this.rowToPlayerAchievement(row,));
  }

  /**
   * Update achievement progress for a player
   */
  async updateProgress(
    playerId: string,
    achievementId: string,
    progressIncrement: number = 1,
  ): Promise<ProgressUpdateResult> {
    const achievement = await this.getAchievement(achievementId,);
    if (!achievement) { throw new Error("Achievement not found",); }

    let playerAchievement = await this.getPlayerAchievement(playerId, achievementId,);
    const now = new Date().toISOString();

    if (!playerAchievement) {
      // Create new progress entry
      const id = crypto.randomUUID();
      const maxProgress = achievement.unlockCondition.count ?? 1;

      await (this.db as any).insertInto("player_achievements",).values({
        id,
        player_id: playerId,
        achievement_id: achievementId,
        progress: 0,
        max_progress: maxProgress,
        is_unlocked: false,
        unlocked_at: null,
        claimed_at: null,
        metadata: "{}",
        created_at: now,
        updated_at: now,
      },).execute();

      playerAchievement = (await this.getPlayerAchievement(playerId, achievementId,))!;
    }

    if (playerAchievement.isUnlocked) {
      return {
        achievementId,
        playerId,
        oldProgress: playerAchievement.progress,
        newProgress: playerAchievement.progress,
        unlocked: false,
        rewards: [],
      };
    }

    const oldProgress = playerAchievement.progress;
    const newProgress = Math.min(oldProgress + progressIncrement, playerAchievement.maxProgress,);
    const unlocked = newProgress >= playerAchievement.maxProgress;

    await (this.db as any)
      .updateTable("player_achievements",)
      .set({
        progress: newProgress,
        is_unlocked: unlocked,
        unlocked_at: unlocked ? now : null,
        updated_at: now,
      },)
      .where("player_id", "=", playerId,)
      .where("achievement_id", "=", achievementId,)
      .execute();

    if (unlocked) {
      getLog().info("Achievement unlocked", {
        playerId,
        achievementId,
        name: achievement.name,
      },);
    }

    return {
      achievementId,
      playerId,
      oldProgress,
      newProgress,
      unlocked,
      rewards: unlocked ? achievement.rewards : [],
    };
  }

  /**
   * Claim achievement rewards
   */
  async claimRewards(playerId: string, achievementId: string,): Promise<AchievementReward[]> {
    const playerAchievement = await this.getPlayerAchievement(playerId, achievementId,);
    if (!playerAchievement) { throw new Error("Player achievement not found",); }
    if (!playerAchievement.isUnlocked) { throw new Error("Achievement not unlocked",); }
    if (playerAchievement.claimedAt) { throw new Error("Rewards already claimed",); }

    const achievement = await this.getAchievement(achievementId,);
    if (!achievement) { throw new Error("Achievement not found",); }

    const now = new Date().toISOString();

    await (this.db as any)
      .updateTable("player_achievements",)
      .set({
        claimed_at: now,
        updated_at: now,
      },)
      .where("player_id", "=", playerId,)
      .where("achievement_id", "=", achievementId,)
      .execute();

    getLog().info("Achievement rewards claimed", {
      playerId,
      achievementId,
      name: achievement.name,
    },);

    return achievement.rewards;
  }

  /**
   * Check if achievement is unlocked for player
   */
  async isUnlocked(playerId: string, achievementId: string,): Promise<boolean> {
    const playerAchievement = await this.getPlayerAchievement(playerId, achievementId,);
    return playerAchievement?.isUnlocked ?? false;
  }

  /**
   * Get achievement statistics for a player
   */
  async getPlayerStats(playerId: string,): Promise<{
    totalUnlocked: number;
    totalAvailable: number;
    byCategory: Record<string, number>;
    byTier: Record<string, number>;
  }> {
    const playerAchievements = await this.getPlayerAchievements(playerId,);
    const allAchievements = await this.listAchievements(undefined, true,);

    const unlocked = playerAchievements.filter((pa,) => pa.isUnlocked);

    const byCategory: Record<string, number> = {};
    const byTier: Record<string, number> = {};

    for (const pa of unlocked) {
      const achievement = allAchievements.find((a,) => a.id === pa.achievementId);
      if (achievement) {
        byCategory[achievement.category] = (byCategory[achievement.category] ?? 0) + 1;
        byTier[achievement.tier] = (byTier[achievement.tier] ?? 0) + 1;
      }
    }

    return {
      totalUnlocked: unlocked.length,
      totalAvailable: allAchievements.length,
      byCategory,
      byTier,
    };
  }

  /**
   * Parse JSON field safely
   */
  private parseJsonField<T,>(raw: unknown, fallback: T,): T {
    if (typeof raw !== "string") { return fallback; }
    try {
      return JSON.parse(raw,) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Convert database row to Achievement interface
   */
  private rowToAchievement(row: any,): Achievement {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tier: row.tier,
      icon: row.icon,
      isSecret: row.is_secret,
      isHidden: row.is_hidden,
      unlockCondition: this.parseJsonField<UnlockCondition>(row.unlock_condition, { type: "simple", },),
      rewards: this.parseJsonField<AchievementReward[]>(row.rewards, [],),
      metadata: this.parseJsonField<Record<string, unknown>>(row.metadata, {},),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert database row to PlayerAchievement interface
   */
  private rowToPlayerAchievement(row: any,): PlayerAchievement {
    return {
      id: row.id,
      playerId: row.player_id,
      achievementId: row.achievement_id,
      progress: row.progress,
      maxProgress: row.max_progress,
      isUnlocked: row.is_unlocked,
      unlockedAt: row.unlocked_at,
      claimedAt: row.claimed_at,
      metadata: this.parseJsonField<Record<string, unknown>>(row.metadata, {},),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
