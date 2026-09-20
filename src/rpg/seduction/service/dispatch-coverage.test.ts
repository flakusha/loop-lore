// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for the seduction service facade and arousal modifiers.
 *
 * The facade methods are thin pass-throughs to dispatcher modules; these
 * tests drive each against a real in-memory DB so the delegation lines and
 * the modifier-multiplier / add-modifier branches in arousal.ts execute.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import { uid, } from "../../../utils.js";
import { SeductionService, } from "./index.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("SeductionService arousal dispatch", () => {
  test("getArousal creates default state; modify applies buildup and ceiling", async () => {
    const svc = new SeductionService(db,);
    const actorId = uid();
    await insertActorsStub(actorId,);

    const created = await svc.getArousal(actorId,);
    expect(created.level,).toBeGreaterThanOrEqual(0,);

    const afterUp = await svc.modifyArousal(actorId, 25,);
    expect(afterUp,).toBeGreaterThan(created.level,);

    const afterDown = await svc.modifyArousal(actorId, -500,);
    expect(afterDown,).toBe(0,);
  });

  test("decayArousal reduces the stored level", async () => {
    const svc = new SeductionService(db,);
    const actorId = uid();
    await insertActorsStub(actorId,);
    await svc.modifyArousal(actorId, 40,);
    const decayed = await svc.decayArousal(actorId,);
    expect(decayed,).toBeLessThan(40,);
  });

  test("addModifier persists a timed modifier that scales later deltas", async () => {
    const svc = new SeductionService(db,);
    const actorId = uid();
    await insertActorsStub(actorId,);
    await svc.modifyArousal(actorId, 10,);
    const level = await svc.getArousal(actorId,);

    await svc.addModifier(actorId, {
      source: "test",
      multiplier: 2,
      duration: 2,
    },);

    const withMod = await svc.getArousal(actorId,);
    expect(withMod.modifiers.length,).toBe(1,);
    expect(withMod.modifiers[0]?.multiplier,).toBe(2,);
    expect(withMod.modifiers[0]?.remainingTurns,).toBe(2,);

    // Modifier multiplies the effective delta (buildup × multiplier).
    const boosted = await svc.modifyArousal(actorId, 1,);
    expect(boosted,).toBeGreaterThan(level.level,);
  });

  test("skill and desire dispatch pass through", async () => {
    const svc = new SeductionService(db,);
    const actorId = uid();
    await insertActorsStub(actorId,);

    const skill = await svc.getSkill(actorId, "dirty_talk", "flattery",);
    expect(skill,).toBeDefined();

    const xp = await svc.awardXp(actorId, "dirty_talk", "flattery", 10,);
    expect(xp,).toHaveProperty("leveled",);
    expect(xp,).toHaveProperty("newLevel",);

    const skills = await svc.getActorSkills(actorId,);
    expect(Array.isArray(skills,),).toBe(true,);
    expect(skills.length,).toBeGreaterThan(0,);

    const profile = await svc.getDesireProfile(actorId,);
    expect(profile,).toBeDefined();
    const updated = await svc.updateDesireProfile(actorId, { turnOns: ["wit",], },);
    expect(updated,).toBe(true,);
  });
});

/** Minimal actor row so FK-bearing helpers have a parent. */
async function insertActorsStub(actorId: string,): Promise<void> {
  const { insertActors, } = await import("../../../test-utils/insert-helpers.js");
  await insertActors(db, `stub-${actorId}`, { id: actorId, },);
}
