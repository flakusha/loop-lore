// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfessionsService tests over a real (per-process ephemeral) test DB.
 *
 * Parallel-safe: fresh DB fixture per file, unique ids per test, no ports,
 * no fixed paths, no sleeps.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ProfessionBonusType, ProfessionTitle, } from "../../../db/enums-crafting";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { CRAFT_XP_MIN, CRAFT_XP_PER_TIER, craftXpForAttempt, ProfessionsService, } from "./index";

// Resource contract: one createTestDb() per file (ephemeral sqlite), rows
// scoped by unique ids per test, destroyed in afterAll; no ports or sleeps.

describe("ProfessionsService", () => {
  let db: Kysely<DB>;
  let svc: ProfessionsService;
  let actorId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    svc = new ProfessionsService(db,);
    const ownerId = uid();
    await insertUsers(
      db,
      `user-${ownerId}`,
      "Profession Owner",
      { id: ownerId, role: "solo", status: "active", settings: "{}", } as never,
    );

    actorId = uid();
    await insertActors(db, "Profession Actor", { id: actorId, owner_id: ownerId, } as never,);
    worldId = uid();
    await insertWorlds(db, ownerId, "Profession World", { id: worldId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("create + get with world scope and title from level", async () => {
    const created = await svc.createProfession({
      actorId,
      worldId,
      discipline: "alchemy",
      level: 30,
    },);

    expect(created.level,).toBe(30,);
    expect(created.title,).toBe(ProfessionTitle.Journeyman,);
    expect(created.experience,).toBe(29 * 100,);

    const fetched = await svc.getProfession(created.id,);
    expect(fetched,).not.toBeNull();
    expect(fetched!.worldId,).toBe(worldId,);
    expect(fetched!.specializations,).toEqual([],);
  });

  test("create world-less profession stores null world", async () => {
    const created = await svc.createProfession({ actorId, discipline: "smithing", },);
    expect(created.worldId,).toBeNull();
    expect(created.level,).toBe(1,);
    expect(created.title,).toBe(ProfessionTitle.Apprentice,);

    const worldLess = await svc.getActorProfessions(actorId, "",);
    expect(worldLess.map(p => p.discipline),).toEqual(["smithing",],);
  });

  test("duplicate discipline for the same actor is rejected", async () => {
    await expect(
      svc.createProfession({ actorId, worldId, discipline: "alchemy", },),
    ).rejects.toThrow("already has",);
  });

  test("level clamped into 1..100", async () => {
    const actor2 = uid();
    await insertActors(db, "Profession Actor 2", { id: actor2, } as never,);
    const low = await svc.createProfession({ actorId: actor2, discipline: "cooking", level: -5, },);
    expect(low.level,).toBe(1,);
    const high = await svc.createProfession({ actorId: actor2, discipline: "engineering", level: 500, },);
    expect(high.level,).toBe(100,);
    expect(high.title,).toBe(ProfessionTitle.Grandmaster,);
  });

  test("actor professions list filters by world", async () => {
    const listed = await svc.getActorProfessions(actorId,);
    expect(listed.length,).toBeGreaterThanOrEqual(2,);
    const inWorld = await svc.getActorProfessions(actorId, worldId,);
    expect(inWorld.map(p => p.discipline),).toEqual(["alchemy",],);
  });

  test("addExperience levels up and changes title at band boundaries", async () => {
    const created = await svc.createProfession({ actorId, worldId, discipline: "enchanting", },);
    const r1 = await svc.addExperience(created.id, 100,);
    expect(r1.leveledUp,).toBe(true,);
    expect(r1.newLevel,).toBe(2,);
    expect(r1.titleChanged,).toBe(false,);

    const r2 = await svc.addExperience(created.id, 24 * 100,);
    expect(r2.newLevel,).toBe(26,);
    expect(r2.titleChanged,).toBe(true,);
    expect(r2.newTitle,).toBe(ProfessionTitle.Journeyman,);
  });

  test("addExperience rejects invalid amounts and unknown ids", async () => {
    await expect(svc.addExperience(uid(), 10,),).rejects.toThrow("Profession not found",);
    const created = await svc.createProfession({ actorId, worldId, discipline: "jewelry", },);
    await expect(svc.addExperience(created.id, 0,),).rejects.toThrow();
    await expect(svc.addExperience(created.id, -5,),).rejects.toThrow();
    await expect(svc.addExperience(created.id, Number.NaN,),).rejects.toThrow();
  });

  test("addExperience caps at level 100", async () => {
    const created = await svc.createProfession({ actorId, worldId, discipline: "woodworking", },);
    const result = await svc.addExperience(created.id, 100_000,);
    expect(result.newLevel,).toBe(100,);
    expect(result.newTitle,).toBe(ProfessionTitle.Grandmaster,);
  });

  test("addSpecialization stores and enforces requirement level", async () => {
    const created = await svc.createProfession({ actorId, worldId, discipline: "tailoring", level: 10, },);
    const spec = await svc.addSpecialization(created.id, {
      name: "Rune Weaving",
      bonusType: ProfessionBonusType.Quality,
      bonusValue: 5,
      requirementLevel: 10,
    },);

    expect(spec.isActive,).toBe(true,);
    expect(spec.professionId,).toBe(created.id,);

    const fetched = await svc.getProfession(created.id,);
    expect(fetched!.specializations?.map(s => s.name),).toEqual(["Rune Weaving",],);

    await expect(
      svc.addSpecialization(created.id, {
        name: "Too Early",
        bonusType: ProfessionBonusType.Speed,
        bonusValue: 5,
        requirementLevel: 11,
      },),
    ).rejects.toThrow("requires level 11",);
  });

  test("addSpecialization rejects unknown professions", async () => {
    await expect(
      svc.addSpecialization(uid(), { name: "X", bonusType: ProfessionBonusType.Success, bonusValue: 1, },),
    ).rejects.toThrow("Profession not found",);
  });
});

describe("craftXpForAttempt (XP-on-craft award table)", () => {
  test("success grants tier x CRAFT_XP_PER_TIER with a CRAFT_XP_MIN floor", () => {
    expect(craftXpForAttempt(1, true,),).toBe(CRAFT_XP_PER_TIER,);
    expect(craftXpForAttempt(3, true,),).toBe(3 * CRAFT_XP_PER_TIER,);
    expect(craftXpForAttempt(0, true,),).toBe(Math.max(CRAFT_XP_MIN, CRAFT_XP_PER_TIER,),);
  });

  test("failure grants half, rounded down", () => {
    expect(craftXpForAttempt(1, false,),).toBe(Math.floor(CRAFT_XP_PER_TIER / 2,),);
    expect(craftXpForAttempt(3, false,),).toBe(Math.floor((3 * CRAFT_XP_PER_TIER) / 2,),);
  });
});
