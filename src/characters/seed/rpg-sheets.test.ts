// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct tests for `persistTemplateRpgSheets`.
 *
 * `templates-rpg.test.ts` covers this through `seedCharacterTemplates`; this
 * file pins the export directly: seeds skills + professions, converges on
 * re-seed, and throws on unknown enum values.
 *
 * Resource contract: one `createTestDb()` per test (unique tmp path) with a
 * `finally` destroy, so each test passes alone and in any order.
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { persistTemplateRpgSheets, } from "./rpg-sheets";

describe("persistTemplateRpgSheets", () => {
  test("seeds skills and world-less professions", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);
      const ownerId = uid();
      await insertUsers(db, `user-${ownerId}`, "Sheet Owner", {
        id: ownerId,
        role: "solo",
        status: "active",
        settings: "{}",
      } as never,);

      const actorId = uid();
      await insertActors(db, "Sheet Actor", { id: actorId, owner_id: ownerId, } as never,);

      await persistTemplateRpgSheets(db, actorId, {
        name: "Seeded",
        description: "direct",
        skills: [{ name: "Lore", category: "knowledge", level: 10, proficiency: "novice", },],
        professions: [{ discipline: "alchemy", level: 5, },],
      },);

      const skills = await db.selectFrom("character_skills",).selectAll().where("actor_id", "=", actorId,).execute();
      expect(skills.map((s,) => s.name),).toEqual(["Lore",],);
      const professions = await db.selectFrom("professions",).selectAll().where("actor_id", "=", actorId,).execute();
      expect(professions,).toHaveLength(1,);
      expect(professions[0]!.discipline,).toBe("alchemy",);
      expect(professions[0]!.world_id,).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("re-seed converges without duplicates", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);
      const ownerId = uid();
      await insertUsers(db, `user-${ownerId}`, "Sheet Owner", {
        id: ownerId,
        role: "solo",
        status: "active",
        settings: "{}",
      } as never,);

      const actorId = uid();
      await insertActors(db, "Sheet Actor", { id: actorId, owner_id: ownerId, } as never,);
      const template = {
        name: "Seeded",
        description: "direct",
        skills: [{ name: "Lore", category: "knowledge", },],
        professions: [{ discipline: "cooking", },],
      };

      await persistTemplateRpgSheets(db, actorId, template,);
      await persistTemplateRpgSheets(db, actorId, template,);

      const skillCount = await db.selectFrom("character_skills",).where("actor_id", "=", actorId,)
        .select((eb,) => eb.fn.countAll<number>().as("n",)).executeTakeFirst();

      expect(Number(skillCount!.n,),).toBe(1,);
      const profCount = await db.selectFrom("professions",).where("actor_id", "=", actorId,)
        .select((eb,) => eb.fn.countAll<number>().as("n",)).executeTakeFirst();

      expect(Number(profCount!.n,),).toBe(1,);
    } finally {
      await db.destroy();
    }
  });

  test("throws on unknown skill category and unknown discipline", async () => {
    const { db, } = await createTestDb();
    try {
      createLogger({ level: "error", },);
      const ownerId = uid();
      await insertUsers(db, `user-${ownerId}`, "Sheet Owner", {
        id: ownerId,
        role: "solo",
        status: "active",
        settings: "{}",
      } as never,);

      const actorId = uid();
      await insertActors(db, "Sheet Actor", { id: actorId, owner_id: ownerId, } as never,);

      await expect(
        persistTemplateRpgSheets(db, actorId, {
          name: "Bad",
          description: "bad skill",
          skills: [{ name: "Nope", category: "sorcery", },],
        },),
      ).rejects.toThrow("unknown category",);

      await expect(
        persistTemplateRpgSheets(db, actorId, {
          name: "Bad",
          description: "bad profession",
          professions: [{ discipline: "sorcery", },],
        },),
      ).rejects.toThrow("unknown discipline",);
    } finally {
      await db.destroy();
    }
  });
});
