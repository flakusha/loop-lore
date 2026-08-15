import type { Kysely, Updateable, } from "kysely";
import type { DB, } from "../../../db";
import type { SkillLockState, } from "../../../db/enums";
import { jsonStringifyOr, } from "../../../utils";
import { getLog, rowToSkill, } from "./helpers";
import type {
  CreateSkillInput,
  Skill,
  SkillCategory,
  UpdateSkillInput,
} from "./types";
import { ProficiencyLevel, } from "./types";

/**
 * Create a new skill for an actor
 */
export async function createSkill(db: Kysely<DB>, input: CreateSkillInput,): Promise<Skill> {
  const now = new Date().toISOString();
  const id: string = crypto.randomUUID();

  const skillData = {
    id,
    actor_id: input.actorId,
    world_id: input.worldId ?? null,
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    level: 1,
    xp: 0,
    proficiency: ProficiencyLevel.Novice,
    specialization: null,
    lock_state: "unlocked" as SkillLockState,
    prerequisites: jsonStringifyOr(input.prerequisites ?? [],),
    metadata: jsonStringifyOr(input.metadata ?? {},),
    created_at: now,
    updated_at: now,
  };

  await db.insertInto("character_skills",).values(skillData,).execute();

  getLog().info("Skill created", { id, actorId: input.actorId, name: input.name, },);

  return rowToSkill(skillData,);
}

/**
 * Get a skill by ID
 */
export async function getSkill(db: Kysely<DB>, skillId: string,): Promise<Skill | null> {
  const row = await db
    .selectFrom("character_skills",)
    .where("id", "=", skillId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToSkill(row,) : null;
}

/**
 * Get all skills for an actor
 */
export async function getActorSkills(db: Kysely<DB>, actorId: string, worldId?: string,): Promise<Skill[]> {
  let query = db
    .selectFrom("character_skills",)
    .where("actor_id", "=", actorId,)
    .orderBy("category", "asc",)
    .orderBy("name", "asc",);

  if (worldId) {
    query = query.where("world_id", "=", worldId,);
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (row,) => rowToSkill(row,),);
}

/**
 * Get skills by category for an actor
 */
export async function getSkillsByCategory(
  db: Kysely<DB>,
  actorId: string,
  category: SkillCategory,
  worldId?: string,
): Promise<Skill[]> {
  let query = db
    .selectFrom("character_skills",)
    .where("actor_id", "=", actorId,)
    .where("category", "=", category,)
    .orderBy("level", "desc",);

  if (worldId) {
    query = query.where("world_id", "=", worldId,);
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (row,) => rowToSkill(row,),);
}

/**
 * Update a skill
 */
export async function updateSkill(db: Kysely<DB>, skillId: string, input: UpdateSkillInput,): Promise<Skill> {
  const now = new Date().toISOString();
  const updates: Updateable<DB["character_skills"]> = {
    updated_at: now,
  };

  if (input.name !== undefined) { updates.name = input.name; }
  if (input.description !== undefined) { updates.description = input.description; }
  if (input.category !== undefined) { updates.category = input.category; }
  if (input.specialization !== undefined) { updates.specialization = input.specialization; }
  if (input.metadata !== undefined) { updates.metadata = jsonStringifyOr(input.metadata,); }

  await db
    .updateTable("character_skills",)
    .set(updates,)
    .where("id", "=", skillId,)
    .execute();

  return (await getSkill(db, skillId,))!;
}

/**
 * Delete a skill
 */
export async function deleteSkill(db: Kysely<DB>, skillId: string,): Promise<void> {
  await db
    .deleteFrom("character_skills",)
    .where("id", "=", skillId,)
    .execute();
}
