// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character-template RPG sheet seeding (TASK-character-config-skills-professions):
 * baseline skills + starting professions created at seed time.
 *
 * Idempotent: existing rows (actor+name / actor+discipline) are skipped, so a
 * re-run after a partial failure converges instead of duplicating. Invalid
 * template values throw (surfaced as seed errors by the caller) rather than
 * silently writing rows the services would reject.
 */
import type { Kysely, } from "kysely";
import type { CharacterTemplate, } from "../../config/sections/characters/types";
import { CraftingDiscipline, ProfessionBonusType, } from "../../db/enums-crafting";
import type { DB, } from "../../db/schema";
import { ProfessionsService, } from "../../rpg/crafting/professions";
import { ProficiencyLevel, SkillCategory, SkillsService, } from "../../rpg/skills";

/**
 * Seed the template's declared RPG sheets.
 * @param database
 * @param actorId — the just-created actor's stable template id
 * @param template
 * @throws {Error} When a template skill/profession references an unknown enum
 *   value, or the services reject the row (duplicate discipline,
 *   specialization requirement above the starting level)
 */
export async function persistTemplateRpgSheets(
  database: Kysely<DB>,
  actorId: string,
  template: CharacterTemplate,
): Promise<void> {
  await seedTemplateSkills(database, actorId, template.skills ?? [],);
  await seedTemplateProfessions(database, actorId, template.professions ?? [],);
}

/**
 * Create the template's baseline skills (idempotent by actor+name).
 * @param database
 * @param actorId
 * @param skills
 * @throws {Error} On unknown category/proficiency enum values
 */
async function seedTemplateSkills(
  database: Kysely<DB>,
  actorId: string,
  skills: NonNullable<CharacterTemplate["skills"]>,
): Promise<void> {
  const svc = new SkillsService(database,);
  for (const skill of skills) {
    if (!isEnumValue(SkillCategory, skill.category,)) {
      throw new Error(`skill ${skill.name}: unknown category ${skill.category}`,);
    }

    const proficiency = skill.proficiency ?? ProficiencyLevel.Novice;
    if (!isEnumValue(ProficiencyLevel, proficiency,)) {
      throw new Error(`skill ${skill.name}: unknown proficiency ${skill.proficiency}`,);
    }

    const existing = await database.selectFrom("character_skills",).select("id",)
      .where("actor_id", "=", actorId,)
      .where("name", "=", skill.name,)
      .executeTakeFirst();

    if (existing) { continue; }

    await svc.createSkill({
      actorId,
      name: skill.name,
      category: skill.category,
      description: skill.description,
      level: skill.level,
      proficiency,
      acquisitionSource: "config",
    },);
  }
}

/**
 * Create the template's starting professions (idempotent by
 * actor+discipline; world-less — professions may pre-date any world).
 * @param database
 * @param actorId
 * @param professions
 * @throws {Error} On unknown discipline/bonusType values or service rejects
 */
async function seedTemplateProfessions(
  database: Kysely<DB>,
  actorId: string,
  professions: NonNullable<CharacterTemplate["professions"]>,
): Promise<void> {
  const svc = new ProfessionsService(database,);
  for (const prof of professions) {
    if (!isEnumValue(CraftingDiscipline, prof.discipline,)) {
      throw new Error(`profession: unknown discipline ${prof.discipline}`,);
    }

    const existing = await database.selectFrom("professions",).select("id",)
      .where("actor_id", "=", actorId,)
      .where("discipline", "=", prof.discipline,)
      .executeTakeFirst();

    if (existing) { continue; }

    const created = await svc.createProfession({
      actorId,
      discipline: prof.discipline,
      level: prof.level,
    },);

    for (const spec of prof.specializations ?? []) {
      if (!isEnumValue(ProfessionBonusType, spec.bonusType,)) {
        throw new Error(`profession ${prof.discipline}: unknown bonus type ${spec.bonusType}`,);
      }

      await svc.addSpecialization(created.id, {
        name: spec.name,
        description: spec.description,
        bonusType: spec.bonusType,
        bonusValue: spec.bonusValue,
        requirementLevel: spec.requirementLevel ?? prof.level ?? 1,
      },);
    }
  }
}

/**
 * String narrowing against a const string-map enum (core template types are
 * string-typed; the app-side enums stay the validation source).
 * @param enumObj
 * @param value
 */
function isEnumValue<T extends Record<string, string>,>(
  enumObj: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObj,).includes(value,);
}
