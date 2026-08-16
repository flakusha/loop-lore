// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getAchievement, listAchievements, } from "./crud";
import { getLog, rowToPlayerAchievement, } from "./helpers";
import type {
  AchievementReward,
  PlayerAchievement,
  ProgressUpdateResult,
} from "./types";

/**
 * Get player achievement progress
 */
export async function getPlayerAchievement(
  db: Kysely<DB>,
  playerId: string,
  achievementId: string,
): Promise<PlayerAchievement | null> {
  const row = await (db as any)
    .selectFrom("player_achievements",)
    .where("player_id", "=", playerId,)
    .where("achievement_id", "=", achievementId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToPlayerAchievement(row,) : null;
}

/**
 * Get all achievements for a player
 */
export async function getPlayerAchievements(db: Kysely<DB>, playerId: string,): Promise<PlayerAchievement[]> {
  const rows = await (db as any)
    .selectFrom("player_achievements",)
    .where("player_id", "=", playerId,)
    .orderBy("unlocked_at", "desc",)
    .selectAll()
    .execute();

  return Array.from(rows, (row: any,) => rowToPlayerAchievement(row,),);
}

/**
 * Update achievement progress for a player
 */
export async function updateProgress(
  db: Kysely<DB>,
  playerId: string,
  achievementId: string,
  progressIncrement = 1,
): Promise<ProgressUpdateResult> {
  const achievement = await getAchievement(db, achievementId,);
  if (!achievement) { throw new Error("Achievement not found",); }

  let playerAchievement = await getPlayerAchievement(db, playerId, achievementId,);
  const now = new Date().toISOString();

  if (!playerAchievement) {
    // Create new progress entry
    const id = crypto.randomUUID();
    const maxProgress = achievement.unlockCondition.count ?? 1;

    await (db as any).insertInto("player_achievements",).values({
      id,
      player_id: playerId,
      achievement_id: achievementId,
      progress: 0,
      max_progress: maxProgress,
      status: "locked",
      unlocked_at: null,
      claimed_at: null,
      metadata: "{}",
      created_at: now,
      updated_at: now,
    },).execute();

    playerAchievement = (await getPlayerAchievement(db, playerId, achievementId,))!;
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

  await (db as any)
    .updateTable("player_achievements",)
    .set({
      progress: newProgress,
      status: unlocked ? "unlocked" : "locked",
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
export async function claimRewards(
  db: Kysely<DB>,
  playerId: string,
  achievementId: string,
): Promise<AchievementReward[]> {
  const playerAchievement = await getPlayerAchievement(db, playerId, achievementId,);
  if (!playerAchievement) { throw new Error("Player achievement not found",); }
  if (!playerAchievement.isUnlocked) { throw new Error("Achievement not unlocked",); }
  if (playerAchievement.claimedAt) { throw new Error("Rewards already claimed",); }

  const achievement = await getAchievement(db, achievementId,);
  if (!achievement) { throw new Error("Achievement not found",); }

  const now = new Date().toISOString();

  await (db as any)
    .updateTable("player_achievements",)
    .set({
      status: "claimed",
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
export async function isUnlocked(db: Kysely<DB>, playerId: string, achievementId: string,): Promise<boolean> {
  const playerAchievement = await getPlayerAchievement(db, playerId, achievementId,);
  return playerAchievement?.isUnlocked ?? false;
}

/**
 * Get achievement statistics for a player
 */
export async function getPlayerStats(db: Kysely<DB>, playerId: string,): Promise<{
  totalUnlocked: number;
  totalAvailable: number;
  byCategory: Record<string, number>;
  byTier: Record<string, number>;
}> {
  const playerAchievements = await getPlayerAchievements(db, playerId,);
  const allAchievements = await listAchievements(db, undefined, true,);

  const unlocked: typeof playerAchievements = [];
  for (const pa of playerAchievements) {
    if (pa.isUnlocked) { unlocked.push(pa,); }
  }

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
