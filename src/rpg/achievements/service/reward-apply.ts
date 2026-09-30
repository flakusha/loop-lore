// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-reward application. Only `story_points` is wired today; the other
 * branches remain unwired pending dedicated services.
 *
 * @module rpg/achievements/service/reward-apply
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { earnStoryPoints, } from "../../../services/agency/story-points";
import { getLog, } from "./helpers";
import type { AchievementReward, } from "./types";

/** Context passed to a per-reward applicator. */
export interface RewardApplyCtx {
  db: Kysely<DB>;
  playerId: string;
  achievementId: string;
}

/**
 * Apply a single achievement reward. Returns `true` when the reward was
 * dispatched (whether it ultimately succeeded or was logged as a failure).
 * Non-`story_points` reward types are intentionally no-ops; callers should
 * not assume success for them.
 * @param {AchievementReward} reward
 * @param {RewardApplyCtx} ctx
 * @returns {Promise<boolean>}
 */
export async function applySingleAchievementReward(
  reward: AchievementReward,
  ctx: RewardApplyCtx,
): Promise<boolean> {
  if (reward.type !== "story_points") { return false; }
  const amount = Number(reward.value,);
  if (!Number.isFinite(amount,) || amount <= 0) { return false; }
  try {
    await earnStoryPoints(ctx.db, {
      actorId: ctx.playerId,
      worldId: null,
      amount: Math.floor(amount,),
      reason: `achievement:${ctx.achievementId}`,
    },);
    return true;
  } catch (err) {
    getLog().warn("story_points reward application failed", {
      playerId: ctx.playerId,
      achievementId: ctx.achievementId,
      amount,
      err: err instanceof Error ? err.message : String(err,),
    },);
    return false;
  }
}
