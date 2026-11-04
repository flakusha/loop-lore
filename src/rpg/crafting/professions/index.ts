// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions Service — a character's progression in crafting/gathering
 * disciplines (tables `professions` / `profession_specializations`,
 * migration `011_crafting_professions.ts`).
 *
 * Titles and level bonuses come from the pure ladder in `./progression.ts`.
 * Conventions mirror the sibling services (stations, skills): a `Kysely<DB>`
 * constructor handle, camelCase row mappers, and thrown `Error`s for
 * not-found / invalid input (routes translate them to 404/400).
 *
 * `world_id` is nullable since migration `094_professions_world_optional.ts`
 * (config-seeded templates carry disciplines before any world exists); the
 * actor+discipline duplicate check below is the enforcement point for
 * world-less rows, whose SQLite UNIQUE entry no longer dedupes (NULLs are
 * distinct).
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { uid, } from "../../../utils.js";
import {
  LEVEL_XP,
  MAX_LEVEL,
  titleForLevel,
} from "./progression.js";
import type {
  AddSpecializationInput,
  CreateProfessionInput,
  Profession,
  ProfessionSpecialization,
  ProfessionXpResult,
} from "./types.js";
export { getProgression, progressionBonuses, titleForLevel, } from "./progression.js";
export type {
  AddSpecializationInput,
  CreateProfessionInput,
  Profession,
  ProfessionBonuses,
  ProfessionProgression,
  ProfessionSpecialization,
  ProfessionXpResult,
} from "./types.js";

/**
 * Map a `professions` row to the domain shape.
 * @param row
 */
function rowToProfession(row: {
  id: string;
  actor_id: string;
  world_id: string | null;
  discipline: Profession["discipline"];
  level: number;
  experience: number;
  title: Profession["title"];
  created_at: string;
  updated_at: string;
},): Profession {
  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    discipline: row.discipline,
    level: row.level,
    experience: row.experience,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a `profession_specializations` row to the domain shape.
 * @param row
 */
function rowToSpecialization(row: {
  id: string;
  profession_id: string;
  name: string;
  description: string | null;
  bonus_type: ProfessionSpecialization["bonusType"];
  bonus_value: number;
  requirement_level: number;
  is_active: number;
  created_at: string;
},): ProfessionSpecialization {
  return {
    id: row.id,
    professionId: row.profession_id,
    name: row.name,
    description: row.description,
    bonusType: row.bonus_type,
    bonusValue: row.bonus_value,
    requirementLevel: row.requirement_level,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

/** CRUD + XP/progression + specializations for actor disciplines. */
export class ProfessionsService {
  private readonly db: Kysely<DB>;
  /**
   * @param db
   */
  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  /**
   * Assign a discipline to an actor.
   * @param input
   * @returns the stored profession
   * @throws {Error} When the actor already holds that discipline, or the
   *   starting level is out of range
   */
  async createProfession(input: CreateProfessionInput,): Promise<Profession> {
    const existing = await this.db.selectFrom("professions",).selectAll()
      .where("actor_id", "=", input.actorId,)
      .where("discipline", "=", input.discipline,)
      .executeTakeFirst();

    if (existing) {
      throw new Error(`Actor already has the ${input.discipline} discipline`,);
    }

    const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(input.level ?? 1,),),);
    const now = new Date().toISOString();
    const row = {
      id: uid(),
      actor_id: input.actorId,
      world_id: input.worldId ?? null,
      discipline: input.discipline,
      level,
      experience: (level - 1) * LEVEL_XP,
      title: titleForLevel(level,),
      created_at: now,
      updated_at: now,
    };

    await this.db.insertInto("professions",).values(row,).execute();
    return rowToProfession(row,);
  }

  /**
   * Get one profession (with its specializations) by ID.
   * @param professionId
   * @returns the profession with its active specializations, or null when no
   *   such ID exists
   */
  async getProfession(professionId: string,): Promise<
    (Profession & {
      specializations: ProfessionSpecialization[];
    }) | null
  > {
    const row = await this.db.selectFrom("professions",).selectAll()
      .where("id", "=", professionId,).executeTakeFirst();

    if (!row) { return null; }

    const specs = await this.listSpecializations(professionId,);
    return { ...rowToProfession(row,), ...{ specializations: specs, }, };
  }

  /**
   * List an actor's professions, optionally world-scoped.
   * @param actorId
   * @param worldId — a world id matches that world; `""` matches the
   *   world-less (null) scope; omit for all
   * @returns the actor's professions
   */
  async getActorProfessions(actorId: string, worldId?: string,): Promise<Profession[]> {
    let q = this.db.selectFrom("professions",).selectAll()
      .where("actor_id", "=", actorId,);

    if (worldId !== undefined) {
      q = worldId === ""
        ? q.where("world_id", "is", null,)
        : q.where("world_id", "=", worldId,);
    }

    const rows = await q.orderBy("discipline",).execute();
    return Array.from(rows, rowToProfession,);
  }

  /**
   * Add XP; crossing a 100-XP boundary levels the profession up and updates
   * its title. Clamped at the level cap.
   * @param professionId
   * @param amount — must be a finite positive number
   * @returns the XP result (leveled-up / title-changed flags)
   * @throws {Error} When the profession does not exist or the amount is
   *   not a finite positive number
   */
  async addExperience(professionId: string, amount: number,): Promise<ProfessionXpResult> {
    if (!Number.isFinite(amount,) || amount <= 0) {
      throw new Error("XP amount must be a finite positive number",);
    }

    const row = await this.db.selectFrom("professions",).selectAll()
      .where("id", "=", professionId,).executeTakeFirst();

    if (!row) { throw new Error("Profession not found",); }

    const totalExperience = row.experience + amount;
    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(totalExperience / LEVEL_XP,),);
    const newTitle = titleForLevel(newLevel,);

    await this.db.updateTable("professions",)
      .set({
        experience: totalExperience,
        level: newLevel,
        title: newTitle,
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", professionId,).execute();

    return {
      professionId,
      xpGained: amount,
      totalExperience,
      newLevel,
      newTitle,
      leveledUp: newLevel > row.level,
      titleChanged: newTitle !== row.title,
    };
  }

  /**
   * Unlock a specialization for a profession.
   * @param professionId
   * @param input
   * @returns the stored specialization
   * @throws {Error} When the profession does not exist, or the
   *   requirement level exceeds the profession's level
   */
  async addSpecialization(professionId: string, input: AddSpecializationInput,): Promise<ProfessionSpecialization> {
    const row = await this.db.selectFrom("professions",).selectAll()
      .where("id", "=", professionId,).executeTakeFirst();

    if (!row) { throw new Error("Profession not found",); }

    const requirementLevel = Math.max(1, Math.round(input.requirementLevel ?? 1,),);
    if (requirementLevel > row.level) {
      throw new Error(`Specialization requires level ${requirementLevel}, profession is level ${row.level}`,);
    }

    const specRow = {
      id: uid(),
      profession_id: professionId,
      name: input.name,
      description: input.description ?? null,
      bonus_type: input.bonusType,
      bonus_value: input.bonusValue,
      requirement_level: requirementLevel,
      requirement_specializations: "[]",
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await this.db.insertInto("profession_specializations",).values(specRow,).execute();
    return rowToSpecialization(specRow,);
  }

  /**
   * @param professionId
   * @returns the profession's active specializations
   */
  async listSpecializations(professionId: string,): Promise<ProfessionSpecialization[]> {
    const rows = await this.db.selectFrom("profession_specializations",).selectAll()
      .where("profession_id", "=", professionId,)
      .where("is_active", "=", 1,)
      .orderBy("requirement_level",).execute();

    return Array.from(rows, rowToSpecialization,);
  }
}
