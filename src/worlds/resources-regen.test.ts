// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resources-regen.test.ts — the node LIFECYCLE.
 *
 * The roll itself is in `resources.test.ts`; this file covers what happens after:
 * the DC formula as a pure function, a NULL `remaining_amount` meaning infinite,
 * and respawn restoring a node once its window elapses. Both files seed through
 * `./resources-fixtures` so a fixture change cannot make them disagree.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { NodeInstanceState, } from "../db/enums";
import { ResourceQuality, } from "../db/enums-story/resources";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { attemptExtraction, calculateExtractionDifficulty, listResources, regenerateResources, } from "./resources";
import {
  ACTOR,
  LOCATION,
  readNode,
  seedNode,
  seedWorld,
  T0,
  TRIVIAL,
  WORLD,
} from "./resources-fixtures";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await seedWorld(db,);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("calculateExtractionDifficulty", () => {
  const node = { extraction_difficulty: 20, quality: ResourceQuality.Common, remaining_amount: 5, state: "available", };

  test("returns the base DC when nothing offsets it", () => {
    expect(calculateExtractionDifficulty(node,),).toBe(20,);
  });

  test("subtracts the actor's ability bonus", () => {
    expect(calculateExtractionDifficulty(node, { abilityBonus: 8, },),).toBe(12,);
  });

  test("raises the DC for each tier above common", () => {
    expect(calculateExtractionDifficulty({ ...node, quality: ResourceQuality.Rare, },),).toBe(26,);
    expect(calculateExtractionDifficulty({ ...node, quality: ResourceQuality.Legendary, },),).toBe(32,);
  });

  test("clamps into [1, 100] so no node is trivially or impossibly winnable", () => {
    expect(calculateExtractionDifficulty(node, { abilityBonus: 999, },),).toBe(1,);
    expect(calculateExtractionDifficulty({ ...node, extraction_difficulty: 500, },),).toBe(100,);
  });
});

describe("infinite nodes", () => {
  test("NULL remaining_amount stays NULL across repeated successes", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: null, },);

    for (const seed of [1, 2, 3, 4, 5,]) {
      const result = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: seed, now: T0, },);
      expect(result.succeeded,).toBe(true,);
      expect(result.remaining,).toBeNull();
    }

    const after = await readNode(db, node,);
    expect(after.remaining_amount,).toBeNull();
    expect(after.state,).toBe(NodeInstanceState.Available,);
    expect(after.respawn_at,).toBeNull();
  });
});

describe("regenerateResources", () => {
  test("restores a node only after its respawn window elapses", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 1, respawnSeconds: 600, },);
    await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },);
    expect((await readNode(db, node,)).state,).toBe(NodeInstanceState.Depleted,);

    const early = await regenerateResources(db, { now: new Date(T0.getTime() + 599_000,), },);
    expect(early.regenerated,).toBe(0,);
    expect((await readNode(db, node,)).state,).toBe(NodeInstanceState.Depleted,);

    const late = await regenerateResources(db, { now: new Date(T0.getTime() + 601_000,), },);
    expect(late.regenerated,).toBe(1,);

    const after = await readNode(db, node,);
    expect(after.state,).toBe(NodeInstanceState.Available,);
    expect(after.respawn_at,).toBeNull();
  });
});

describe("listResources", () => {
  test("reports the node with its quality and remaining amount", async () => {
    await seedNode(db, { difficulty: TRIVIAL, quality: ResourceQuality.Rare, remaining: 4, },);

    const list = await listResources(db, WORLD, LOCATION,);

    expect(list,).toHaveLength(1,);
    expect(list[0]!.name,).toBe("Iron Vein",);
    expect(list[0]!.quality,).toBe(ResourceQuality.Rare,);
    expect(list[0]!.remainingAmount,).toBe(4,);
  });

  test("returns nothing for a location with no nodes", async () => {
    expect(await listResources(db, WORLD, "empty",),).toEqual([],);
  });
});
