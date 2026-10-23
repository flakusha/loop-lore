// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skill progression tests (`addXp`, `specializeSkill`): the xp/level curve
 * boundaries, proficiency thresholds, guard clauses, and persisted writes.
 *
 * Resource contract: every test runs against its own fresh in-memory SQLite
 * DB (`createTestDb` in `beforeEach`, destroyed in `afterEach`). Ids are
 * fixed per test but each test seeds exactly what it asserts — no ordering
 * dependence, no shared state, no fs/ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertCharacterSkills, } from "../../../test-utils/insert-helpers";
import { getSkill, } from "./crud";
import { addXp, specializeSkill, } from "./progression";
import { ProficiencyLevel, } from "./types";

createLogger({ level: "error", },);

let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  await insertActors(db, "Fighter", { id: "actor-1", },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** Seed one character_skills row; returns its id. */
async function seedSkill(
  opts?: { id?: string; xp?: number; level?: number; proficiency?: ProficiencyLevel; specialization?: string | null },
): Promise<string> {
  return insertCharacterSkills(db, "actor-1", "Axes", "combat", {
    id: opts?.id ?? "skill-1",
    xp: opts?.xp ?? 0,
    level: opts?.level ?? 1,
    proficiency: opts?.proficiency ?? ProficiencyLevel.Novice,
    specialization: opts?.specialization ?? null,
  },);
}

describe("addXp", () => {
  test("rejects negative xp and leaves the row untouched", async () => {
    const id = await seedSkill({ xp: 40, level: 1, },);

    await expect(addXp(db, id, -1,),).rejects.toThrow(
      "Invalid XP amount -1: must be a finite, non-negative integer number",
    );

    const after = await getSkill(db, id,);
    expect(after!.xp,).toBe(40,);
    expect(after!.level,).toBe(1,);
  });

  test("rejects non-finite xp amounts", async () => {
    const id = await seedSkill({},);

    await expect(addXp(db, id, Number.NaN,),).rejects.toThrow(
      "Invalid XP amount NaN: must be a finite, non-negative integer number",
    );

    await expect(addXp(db, id, Number.POSITIVE_INFINITY,),).rejects.toThrow(
      "Invalid XP amount Infinity: must be a finite, non-negative integer number",
    );

    await expect(addXp(db, id, Number.NEGATIVE_INFINITY,),).rejects.toThrow(
      "Invalid XP amount -Infinity: must be a finite, non-negative integer number",
    );

    expect((await getSkill(db, id,))!.xp,).toBe(0,);
  });

  test("rejects a missing skill", async () => {
    await expect(addXp(db, "missing-skill", 10,),).rejects.toThrow("Skill not found",);
  });

  test("accumulates xp without crossing the level or proficiency curve", async () => {
    const id = await seedSkill({},);

    const result = await addXp(db, id, 10,);

    expect(result,).toEqual({
      skillId: id,
      xpGained: 10,
      totalXp: 10,
      newLevel: 1,
      newProficiency: ProficiencyLevel.Novice,
      leveledUp: false,
      proficiencyChanged: false,
    },);

    const after = await getSkill(db, id,);
    expect(after!.xp,).toBe(10,);
    expect(after!.level,).toBe(1,);
    expect(after!.proficiency,).toBe(ProficiencyLevel.Novice,);
  });

  test("zero xp is a no-op gain", async () => {
    const id = await seedSkill({},);

    const result = await addXp(db, id, 0,);

    expect(result.totalXp,).toBe(0,);
    expect(result.leveledUp,).toBe(false,);
    expect(result.proficiencyChanged,).toBe(false,);
    expect((await getSkill(db, id,))!.xp,).toBe(0,);
  });

  test("crosses the level boundary at 50 total xp", async () => {
    const id = await seedSkill({ xp: 49, },);

    const result = await addXp(db, id, 1,);

    expect(result.totalXp,).toBe(50,);
    expect(result.newLevel,).toBe(2,);
    expect(result.leveledUp,).toBe(true,);
    expect((await getSkill(db, id,))!.level,).toBe(2,);
  });

  test("stays on level 1 just below the boundary", async () => {
    const id = await seedSkill({ xp: 48, },);

    const result = await addXp(db, id, 1,);

    expect(result.totalXp,).toBe(49,);
    expect(result.newLevel,).toBe(1,);
    expect(result.leveledUp,).toBe(false,);
  });

  test("steps proficiency up at the 100 xp threshold", async () => {
    const id = await seedSkill({ xp: 99, },);

    const result = await addXp(db, id, 1,);

    expect(result.totalXp,).toBe(100,);
    expect(result.newProficiency,).toBe(ProficiencyLevel.Apprentice,);
    expect(result.proficiencyChanged,).toBe(true,);
    expect((await getSkill(db, id,))!.proficiency,).toBe(ProficiencyLevel.Apprentice,);
  });

  test("keeps Novice just below the 100 xp threshold", async () => {
    const id = await seedSkill({ xp: 98, },);

    const result = await addXp(db, id, 1,);

    expect(result.totalXp,).toBe(99,);
    expect(result.newProficiency,).toBe(ProficiencyLevel.Novice,);
    expect(result.proficiencyChanged,).toBe(false,);
  });

  test("reaches Grandmaster at the 1500 xp ceiling", async () => {
    const id = await seedSkill({ xp: 1499, },);

    const result = await addXp(db, id, 1,);

    expect(result.totalXp,).toBe(1500,);
    expect(result.newProficiency,).toBe(ProficiencyLevel.Grandmaster,);
    expect(result.proficiencyChanged,).toBe(true,);
    expect((await getSkill(db, id,))!.proficiency,).toBe(ProficiencyLevel.Grandmaster,);
  });
});

describe("specializeSkill", () => {
  test("rejects a missing skill", async () => {
    await expect(specializeSkill(db, "missing-skill", "Cleaving",),).rejects.toThrow("Skill not found",);
  });

  test("rejects specializations below Expert", async () => {
    for (
      const proficiency of [
        ProficiencyLevel.Novice,
        ProficiencyLevel.Apprentice,
        ProficiencyLevel.Journeyman,
      ]
    ) {
      const id = await seedSkill({ id: `skill-${proficiency}`, proficiency, },);

      await expect(specializeSkill(db, id, "Cleaving",),).rejects.toThrow(
        "Skill must be at least Expert level to specialize",
      );

      expect((await getSkill(db, id,))!.specialization,).toBeNull();
    }
  });

  test("specializes Expert, Master, and Grandmaster skills", async () => {
    for (
      const proficiency of [
        ProficiencyLevel.Expert,
        ProficiencyLevel.Master,
        ProficiencyLevel.Grandmaster,
      ]
    ) {
      const id = await seedSkill({ id: `skill-${proficiency}`, proficiency, },);

      const result = await specializeSkill(db, id, "Cleaving",);

      expect(result.specialization,).toBe("Cleaving",);
      expect(result.proficiency,).toBe(proficiency,);
      expect((await getSkill(db, id,))!.specialization,).toBe("Cleaving",);
    }
  });

  test("overwrites an existing specialization", async () => {
    const id = await seedSkill({ proficiency: ProficiencyLevel.Expert, specialization: "Cleaving", },);

    const result = await specializeSkill(db, id, "Sundering",);

    expect(result.specialization,).toBe("Sundering",);
    expect((await getSkill(db, id,))!.specialization,).toBe("Sundering",);
  });
});
