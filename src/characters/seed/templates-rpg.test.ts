// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character-template RPG sheet seeding tests
 * (TASK-character-config-skills-professions): baseline skills and starting
 * professions created at seed time, idempotent on re-seed, world-less
 * professions stored with NULL world_id (095 invariant).
 *
 * Resource contract (parallel-safe): every test owns its own ephemeral
 * sqlite (`createTestDb()` per test — unique tmp path, no ports) and
 * destroys it in a `finally` block, so failed tests cannot leak into
 * siblings. No shared globals, no ordering dependence — each test passes
 * alone and in any order.
 */
import { describe, expect, test, } from "bun:test";
import type { CharactersConfig, } from "../../config/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { seedCharacterTemplates, } from ".";

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
  test("seeds declared skills and professions for the created actor", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);

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
    } finally {
      await db.destroy();
    }
  });

  test("re-seed never duplicates rpg rows (idempotent by actor+discipline)", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);

      const first = await seedCharacterTemplates(db, CONFIG,);
      expect(first.created,).toBe(1,);

      // Re-run against the SAME database simulates a re-seed after partial
      // failure: the actor exists, so the whole template is skipped.
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
    } finally {
      await db.destroy();
    }
  });

  test("invalid discipline surfaces as a seed error, not a silent row", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);

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
    } finally {
      await db.destroy();
    }
  });
});
