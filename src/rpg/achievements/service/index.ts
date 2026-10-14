// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Achievements Service
 *
 * Manages player achievements, trophies, badges, and milestones.
 * Tracks accomplishments and provides rewards for completion.
 *
 * The concrete logic lives in isolated dispatcher modules (crud, progress,
 * helpers) threaded with an explicit `db` handle. `AchievementsService`
 * remains a class so its methods stay on the prototype.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import {
  createAchievement as createAchievementDispatch,
  deleteAchievement as deleteAchievementDispatch,
  getAchievement as getAchievementDispatch,
  listAchievements as listAchievementsDispatch,
  updateAchievement as updateAchievementDispatch,
} from "./crud";
import {
  claimRewards as claimRewardsDispatch,
  getPlayerAchievement as getPlayerAchievementDispatch,
  getPlayerAchievements as getPlayerAchievementsDispatch,
  getPlayerStats as getPlayerStatsDispatch,
  isUnlocked as isUnlockedDispatch,
  updateProgress as updateProgressDispatch,
} from "./progress";
import type {
  Achievement,
  AchievementCategory,
  AchievementReward,
  CreateAchievementInput,
  PlayerAchievement,
  ProgressUpdateResult,
  UpdateAchievementInput,
} from "./types";

export type {
  Achievement,
  AchievementReward,
  CreateAchievementInput,
  PlayerAchievement,
  ProgressUpdateResult,
  UnlockCondition,
  UpdateAchievementInput,
} from "./types";
export { AchievementCategory, AchievementTier, } from "./types";

/** Achievements Service */
export class AchievementsService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new achievement definition
   * @param input
   * @returns the stored achievement definition
   */
  async createAchievement(input: CreateAchievementInput,): Promise<Achievement> {
    return createAchievementDispatch(this.db, input,);
  }

  /**
   * Get an achievement by ID
   * @param achievementId
   * @returns the achievement definition, or null when no such ID exists
   */
  async getAchievement(achievementId: string,): Promise<Achievement | null> {
    return getAchievementDispatch(this.db, achievementId,);
  }

  /**
   * List all achievements
   * @param category
   * @param includeSecret
   * @returns matching achievements, secret ones only when includeSecret is set
   */
  async listAchievements(
    category?: AchievementCategory,
    includeSecret = false,
  ): Promise<Achievement[]> {
    return listAchievementsDispatch(this.db, category, includeSecret,);
  }

  /**
   * Update an achievement
   * @param achievementId
   * @param input
   * @returns the achievement as reloaded after the update
   */
  async updateAchievement(achievementId: string, input: UpdateAchievementInput,): Promise<Achievement> {
    return updateAchievementDispatch(this.db, achievementId, input,);
  }

  /**
   * Delete an achievement
   * @param achievementId
   * @returns nothing; the definition row is gone
   */
  async deleteAchievement(achievementId: string,): Promise<void> {
    return deleteAchievementDispatch(this.db, achievementId,);
  }

  /**
   * Get player achievement progress
   * @param playerId
   * @param achievementId
   * @returns the player's progress row, or null when they have no entry for it
   */
  async getPlayerAchievement(playerId: string, achievementId: string,): Promise<PlayerAchievement | null> {
    return getPlayerAchievementDispatch(this.db, playerId, achievementId,);
  }

  /**
   * Get all achievements for a player
   * @param playerId
   * @returns every progress row belonging to the player
   */
  async getPlayerAchievements(playerId: string,): Promise<PlayerAchievement[]> {
    return getPlayerAchievementsDispatch(this.db, playerId,);
  }

  /**
   * Update achievement progress for a player
   * @param playerId
   * @param achievementId
   * @param progressIncrement
   * @returns the new progress total and whether this call unlocked the achievement
   */
  async updateProgress(
    playerId: string,
    achievementId: string,
    progressIncrement = 1,
  ): Promise<ProgressUpdateResult> {
    return updateProgressDispatch(this.db, playerId, achievementId, progressIncrement,);
  }

  /**
   * Claim achievement rewards
   * @param playerId
   * @param achievementId
   * @returns the rewards credited by this claim
   */
  async claimRewards(playerId: string, achievementId: string,): Promise<AchievementReward[]> {
    return claimRewardsDispatch(this.db, playerId, achievementId,);
  }

  /**
   * Check if achievement is unlocked for player
   * @param playerId
   * @param achievementId
   * @returns true once the player has unlocked this achievement
   */
  async isUnlocked(playerId: string, achievementId: string,): Promise<boolean> {
    return isUnlockedDispatch(this.db, playerId, achievementId,);
  }

  /**
   * Get achievement statistics for a player
   * @param playerId
   * @returns unlocked/total counts plus per-category and per-tier unlock breakdowns
   */
  async getPlayerStats(playerId: string,): Promise<{
    totalUnlocked: number;
    totalAvailable: number;
    byCategory: Record<string, number>;
    byTier: Record<string, number>;
  }> {
    return getPlayerStatsDispatch(this.db, playerId,);
  }
}
