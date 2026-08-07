import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getSkill, } from "./crud";
import { calculateLevel, calculateProficiency, getLog, } from "./helpers";
import type { Skill, XpGainResult, } from "./types";
import { ProficiencyLevel, } from "./types";

/**
 * Add XP to a skill
 */
export async function addXp(db: Kysely<DB>, skillId: string, xpAmount: number,): Promise<XpGainResult> {
  const skill = await getSkill(db, skillId,);
  if (!skill) { throw new Error("Skill not found",); }

  const oldLevel = skill.level;
  const oldProficiency = skill.proficiency;
  const newXp = skill.xp + xpAmount;
  const newLevel = calculateLevel(newXp,);
  const newProficiency = calculateProficiency(newXp,);

  const leveledUp = newLevel > oldLevel;
  const proficiencyChanged = newProficiency !== oldProficiency;

  await db
    .updateTable("character_skills",)
    .set({
      xp: newXp,
      level: newLevel,
      proficiency: newProficiency,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", skillId,)
    .execute();

  if (leveledUp) {
    getLog().info("Skill leveled up", {
      skillId,
      name: skill.name,
      oldLevel,
      newLevel,
    },);
  }

  if (proficiencyChanged) {
    getLog().info("Skill proficiency changed", {
      skillId,
      name: skill.name,
      oldProficiency,
      newProficiency,
    },);
  }

  return {
    skillId,
    xpGained: xpAmount,
    totalXp: newXp,
    newLevel,
    newProficiency,
    leveledUp,
    proficiencyChanged,
  };
}

/**
 * Specialize a skill
 */
export async function specializeSkill(db: Kysely<DB>, skillId: string, specialization: string,): Promise<Skill> {
  const skill = await getSkill(db, skillId,);
  if (!skill) { throw new Error("Skill not found",); }

  if (
    skill.proficiency !== ProficiencyLevel.Expert &&
    skill.proficiency !== ProficiencyLevel.Master &&
    skill.proficiency !== ProficiencyLevel.Grandmaster
  ) {
    throw new Error("Skill must be at least Expert level to specialize",);
  }

  await db
    .updateTable("character_skills",)
    .set({
      specialization,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", skillId,)
    .execute();

  getLog().info("Skill specialized", { skillId, name: skill.name, specialization, },);

  return (await getSkill(db, skillId,))!;
}
