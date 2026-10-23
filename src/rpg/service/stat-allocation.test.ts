// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { AllocationValidationError, getStatAllocation, putStatAllocation, } from "./stat-allocation.js";

describe("stat allocation service", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `alloc-user-${userId}`, "Alloc User", { id: userId, } as never,);
    worldId = await insertWorlds(db, userId, "Stat World", {
      requires_stats: 1,
      stat_point_budget: 27,
      stat_min: 8,
      stat_max: 15,
    },);

    actorId = await insertActors(db, "Alloc Actor",);
  },);

  test("put + get roundtrip", async () => {
    const stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    const written = await putStatAllocation({ database: db, }, actorId, worldId, stats, ["fast_reflexes",], userId,);
    expect(written.traitIds,).toEqual(["fast_reflexes",],);
    const read = await getStatAllocation({ database: db, }, actorId,);
    expect(read?.stats,).toEqual(stats,);
  });

  test("rejects budget overflow", async () => {
    const over = { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15, };
    await expect(putStatAllocation({ database: db, }, actorId, worldId, over, [], userId,),).rejects.toBeInstanceOf(
      AllocationValidationError,
    );
  });

  test("rejects unknown trait", async () => {
    const stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    await expect(putStatAllocation({ database: db, }, actorId, worldId, stats, ["nope",], userId,),).rejects.toThrow();
  });

  test("rejects out-of-scope trait", async () => {
    const stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    await expect(
      putStatAllocation({ database: db, }, actorId, worldId, stats, ["shadow_step",], userId,),
    ).rejects.toBeInstanceOf(AllocationValidationError,);
  });

  test("duplicate traitIds collapse", async () => {
    const stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    const written = await putStatAllocation({ database: db, }, actorId, worldId, stats, [
      "fast_reflexes",
      "fast_reflexes",
    ], userId,);

    expect(written.traitIds,).toEqual(["fast_reflexes",],);
  });

  test("empty traitIds allowed", async () => {
    const stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    const written = await putStatAllocation({ database: db, }, actorId, worldId, stats, [], userId,);
    expect(written.traitIds,).toEqual([],);
  });

  test("accepts custom world bounds below the standard table floor", async () => {
    const customWorld = await insertWorlds(db, userId, "Custom Bounds", {
      requires_stats: 1,
      stat_point_budget: 20,
      stat_min: 6,
      stat_max: 14,
    },);

    const customActor = await insertActors(db, "Custom Bounds Actor",);
    const stats = { str: 6, dex: 6, con: 6, int: 6, wis: 6, cha: 6, };
    const written = await putStatAllocation({ database: db, }, customActor, customWorld, stats, [], userId,);
    expect(written.stats,).toEqual(stats,);
  });

  test("get returns null when absent", async () => {
    expect(await getStatAllocation({ database: db, }, `missing-${crypto.randomUUID()}`,),).toBeNull();
  });
});
