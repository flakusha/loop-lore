// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { IntimacyService, } from "./index";

createLogger({ level: "error", },);

/** */
async function seedTestDb(): Promise<Kysely<DB>> {
  const { db, } = await createTestDb();
  await insertActors(db, "Actor 1", { id: "actor-1", } as never,);
  await insertActors(db, "Actor 2", { id: "actor-2", } as never,);
  return db;
}

const GIFT = {
  id: "action-gift",
  name: "Gift",
  type: "gift",
  delta: 10,
  minIntimacy: 0,
  requiresConsent: false,
} as const;

describe("IntimacyService class API", () => {
  test("applyInteraction returns the post-delta score", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const score = await service.applyInteraction("actor-1", "actor-2", GIFT,);

    expect(score,).toBe(10,);
  });

  test("pairs are directed rows keyed by (actor, target)", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await service.applyInteraction("actor-1", "actor-2", GIFT,);

    const ab = await service.getPair("actor-1", "actor-2",);
    const ba = await service.getPair("actor-2", "actor-1",);
    expect(ba.id,).not.toBe(ab.id,);
    expect(ba.actorId,).toBe("actor-2",);
    expect(ba.targetActorId,).toBe("actor-1",);
  });

  test("applyAction reports blocked actions without mutating the score", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { ...GIFT, minIntimacy: 50, },
    },);

    expect(result.applied,).toBe(false,);
    expect(result.newScore,).toBe(0,);
    expect((await service.getPair("actor-1", "actor-2",)).score,).toBe(0,);
  });

  test("getActorPairs lists the actor's pairs", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await service.applyInteraction("actor-1", "actor-2", GIFT,);
    const pairs = await service.getActorPairs("actor-1",);

    expect(pairs.length,).toBeGreaterThanOrEqual(1,);
    expect(pairs.some((p,) => p.actorId === "actor-1" && p.targetActorId === "actor-2"),).toBe(true,);
  });

  test("decayAll drifts scores toward zero", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await service.applyInteraction("actor-1", "actor-2", GIFT,);
    await service.decayAll("actor-1", 4,);

    const score = (await service.getPair("actor-1", "actor-2",)).score;
    expect(score,).toBeLessThan(10,);
    expect(score,).toBeGreaterThanOrEqual(0,);
  });

  test("getLevelLabel maps scores to ordered labels", () => {
    expect(IntimacyService.getLevelLabel(0,),).toBe("Strangers",);
    expect(IntimacyService.getLevelLabel(100,),).toBe("Soulbonded",);
    expect(IntimacyService.getLevelLabel(-5,),).toBe("Strangers",);
  });
});
