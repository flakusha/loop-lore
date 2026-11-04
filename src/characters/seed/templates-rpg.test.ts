// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character-template RPG sheet seeding tests
 * (TASK-character-config-skills-professions): baseline skills and starting
 * professions created at seed time, idempotent on re-seed, world-less
 * professions stored with NULL world_id (095 invariant).
 *
 * Parallel-safe: one createTestDb per file, no ports, no sleeps.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { CharactersConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { seedCharacterTemplates, } from ".";

// Resource contract: one createTestDb per file (ephemeral sqlite), destroyed
// in afterAll; no ports, no fixed paths, no sleeps.

const CONFIG: CharactersConfig = {
  enabled: true,
  templates: [
    {
      id: "tpl-rpg-seeded",
      name: "RPG Seeded Sage",
      description: "Template with declared skills and professions",
      skills: [
        { name: "Lore Mastery", category: "knowledge", level: 60, proficiency: "expert", },
        { name: "Arcana", category: "magic", level: 35, proficiency: "journeyman", },
      ],
      professions: [
        {
          discipline: "enchanting",
          level: 30,
          specializations: [
            { name: "Rune Weaving", bonusType: "quality", bonusValue: 5, },
          ],
        },
      ],
    },
  ],
};

describe("seedCharacterTemplates — RPG sheets", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("seeds declared skills and professions for the created actor", async () => {
    const result = await seedCharacterTemplates(db, CONFIG,);
    expect(result.created,).toBe(1,);
    expect(result.errors,).toEqual([],);

    const actor = await db.selectFrom("actors",).select("id",)
      .where("display_name", "=", "RPG Seeded Sage",).executeTakeFirst();

    expect(actor,).toBeDefined();
    const actorId = actor!.id;

    const skills = await db.selectFrom("character_skills",).selectAll()
      .where("actor_id", "=", actorId,).orderBy("name",).execute();

    expect(skills.map(s => s.name),).toEqual(["Arcana", "Lore Mastery",],);
    const lore = skills.find(s => s.name === "Lore Mastery")!;
    expect(lore.level,).toBe(60,);
    expect(lore.proficiency,).toBe("expert",);
    expect(lore.acquisition_source,).toBe("config",);

    const professions = await db.selectFrom("professions",).selectAll()
      .where("actor_id", "=", actorId,).execute();

    expect(professions,).toHaveLength(1,);
    expect(professions[0]!.discipline,).toBe("enchanting",);
    expect(professions[0]!.level,).toBe(30,);
    expect(professions[0]!.title,).toBe("journeyman",);
    // Invariant (095): template professions are world-less → NULL world_id,
    // never a sentinel string that would violate the worlds FK.
    expect(professions[0]!.world_id,).toBeNull();

    const specs = await db.selectFrom("profession_specializations",).selectAll()
      .where("profession_id", "=", professions[0]!.id,).execute();

    expect(specs,).toHaveLength(1,);
    expect(specs[0]!.name,).toBe("Rune Weaving",);
  });

  test("re-seed skips the actor and never duplicates rpg rows", async () => {
    const reseeded = await seedCharacterTemplates(db, CONFIG,);
    expect(reseeded.created,).toBe(0,);
    expect(reseeded.skipped,).toBe(1,);

    const skillCount = await db.selectFrom("character_skills",)
      .where("name", "=", "Lore Mastery",)
      .select((eb,) => eb.fn.countAll<number>().as("n",)).executeTakeFirst();

    expect(Number(skillCount!.n,),).toBe(1,);
    const profCount = await db.selectFrom("professions",)
      .where("discipline", "=", "enchanting",)
      .select((eb,) => eb.fn.countAll<number>().as("n",)).executeTakeFirst();

    expect(Number(profCount!.n,),).toBe(1,);
  });

  test("invalid discipline surfaces as a seed error, not a silent row", async () => {
    const bad: CharactersConfig = {
      enabled: true,
      templates: [{
        name: "Bad Discipline",
        description: "Template with an invalid profession",
        professions: [{ discipline: "sorcery", },],
      },],
    };

    const result = await seedCharacterTemplates(db, bad,);
    expect(result.created,).toBe(0,);
    expect(result.errors.length,).toBeGreaterThan(0,);
    expect(result.errors.join(" ",),).toContain("unknown discipline",);
  });
});
