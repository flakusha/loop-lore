// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Achievements System — Public API
 *
 * Re-exports achievements services for use by routes and other modules.
 */
export { AchievementsService, } from "./service";
export type {
  Achievement,
  AchievementReward,
  CreateAchievementInput,
  PlayerAchievement,
  ProgressUpdateResult,
  UnlockCondition,
  UpdateAchievementInput,
} from "./service";
export { AchievementCategory, AchievementTier, } from "./service";
