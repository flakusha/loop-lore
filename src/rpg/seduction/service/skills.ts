// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type {
  SeductionSkillCategory,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { uid, } from "../../../utils";
import { rowToSkill, } from "./helpers";
import type { SeductionSkill, } from "./types";

/** Maximum skill level. */
const MAX_SKILL_LEVEL = 100;

/** XP required per skill level (scales quadratically). */
function xpForLevel(level: number,): number {
  return Math.floor(50 * level * (1 + level * 0.1),);
}

/**
 * Get or create a seduction skill for an actor.
 */
export async function getSkill(
  db: Kysely<DB>,
  actorId: string,
  category: SeductionSkillCategory,
  name: string,
): Promise<SeductionSkill> {
  const row = await db
    .selectFrom("character_seduction_skills",)
    .where("actor_id", "=", actorId,)
    .where("skill_category", "=", category,)
    .where("skill_name", "=", name,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToSkill(row,);
  }

  // Create level 1 skill
  const now = new Date().toISOString();
  const id = uid();

  await db
    .insertInto("character_seduction_skills",)
    .values({
      id,
      actor_id: actorId,
      skill_category: category,
      skill_name: name,
      level: 1,
      xp: 0,
      xp_to_next: xpForLevel(1,),
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    category,
    name,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1,),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Award XP to a seduction skill and level up if threshold reached.
 */
export async function awardXp(
  db: Kysely<DB>,
  actorId: string,
  category: SeductionSkillCategory,
  name: string,
  amount: number,
): Promise<{ leveled: boolean; newLevel: number }> {
  const skill = await getSkill(db, actorId, category, name,);
  const newXp = skill.xp + amount;

  if (newXp < skill.xpToNext) {
    // No level up — just update XP
    const now = new Date().toISOString();
    await db
      .updateTable("character_seduction_skills",)
      .set({ xp: newXp, updated_at: now, },)
      .where("id", "=", skill.id,)
      .execute();

    return { leveled: false, newLevel: skill.level, };
  }

  // Level up
  const newLevel = Math.min(MAX_SKILL_LEVEL, skill.level + 1,);
  const overflowXp = newXp - skill.xpToNext;
  const now = new Date().toISOString();

  await db
    .updateTable("character_seduction_skills",)
    .set({
      level: newLevel,
      xp: overflowXp,
      xp_to_next: xpForLevel(newLevel,),
      updated_at: now,
    },)
    .where("id", "=", skill.id,)
    .execute();

  const log = getLogger().child({ module: "seduction", },);
  log.info(`Seduction skill ${name} leveled up: ${skill.level}→${newLevel}`,);

  return { leveled: true, newLevel, };
}

/**
 * Get all seduction skills for an actor.
 */
export async function getActorSkills(db: Kysely<DB>, actorId: string,): Promise<SeductionSkill[]> {
  const rows = await db
    .selectFrom("character_seduction_skills",)
    .where("actor_id", "=", actorId,)
    .orderBy("skill_category", "asc",)
    .orderBy("skill_name", "asc",)
    .selectAll()
    .execute();

  return Array.from(rows, (r,) => rowToSkill(r,),);
}
