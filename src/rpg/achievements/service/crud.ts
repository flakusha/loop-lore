// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { jsonStringifyOr, } from "../../../utils";
import { getLog, rowToAchievement, } from "./helpers";
import type {
  Achievement,
  AchievementCategory,
  CreateAchievementInput,
  UpdateAchievementInput,
} from "./types";

/**
 * Create a new achievement definition
 */
export async function createAchievement(db: Kysely<DB>, input: CreateAchievementInput,): Promise<Achievement> {
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
    unlock_condition: jsonStringifyOr(input.unlockCondition,),
    rewards: jsonStringifyOr(input.rewards ?? [],),
    metadata: jsonStringifyOr(input.metadata ?? {},),
    created_at: now,
    updated_at: now,
  };

  await (db as any).insertInto("achievements",).values(achievementData,).execute();

  getLog().info("Achievement created", { id, name: input.name, category: input.category, },);

  return rowToAchievement(achievementData,);
}

/**
 * Get an achievement by ID
 */
export async function getAchievement(db: Kysely<DB>, achievementId: string,): Promise<Achievement | null> {
  const row = await (db as any)
    .selectFrom("achievements",)
    .where("id", "=", achievementId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToAchievement(row,) : null;
}

/**
 * List all achievements
 */
export async function listAchievements(
  db: Kysely<DB>,
  category?: AchievementCategory,
  includeSecret = false,
): Promise<Achievement[]> {
  let query = (db as any)
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
  return Array.from(rows, (row: any,) => rowToAchievement(row,),);
}

/**
 * Update an achievement
 */
export async function updateAchievement(
  db: Kysely<DB>,
  achievementId: string,
  input: UpdateAchievementInput,
): Promise<Achievement> {
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
  if (input.unlockCondition !== undefined) { updates.unlock_condition = jsonStringifyOr(input.unlockCondition,); }
  if (input.rewards !== undefined) { updates.rewards = jsonStringifyOr(input.rewards,); }
  if (input.metadata !== undefined) { updates.metadata = jsonStringifyOr(input.metadata,); }

  await (db as any)
    .updateTable("achievements",)
    .set(updates,)
    .where("id", "=", achievementId,)
    .execute();

  return (await getAchievement(db, achievementId,))!;
}

/**
 * Delete an achievement
 */
export async function deleteAchievement(db: Kysely<DB>, achievementId: string,): Promise<void> {
  // Delete player progress first
  await (db as any)
    .deleteFrom("player_achievements",)
    .where("achievement_id", "=", achievementId,)
    .execute();

  await (db as any)
    .deleteFrom("achievements",)
    .where("id", "=", achievementId,)
    .execute();
}
