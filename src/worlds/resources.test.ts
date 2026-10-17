// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resources.test.ts — the extraction ROLL and what it consumes.
 *
 * Every attempt supplies `rngSeed` and `now`, so each case is reproducible: the
 * "succeeds" and "fails" tests differ ONLY in the difficulty they set up, which
 * makes the boundary itself the assertion rather than a lucky roll.
 *
 * The case that matters most is the negative one. A FAILED attempt must not
 * consume the node — a silent-corruption bug if it regresses, because nothing
 * throws; the ore just quietly evaporates under a player who got nothing for it.
 * The lifecycle half (infinite nodes, respawn, listing) lives in
 * `resources-regen.test.ts`; both files seed through `./resources-fixtures`.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { NodeInstanceState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { attemptExtraction, ResourceError, } from "./resources";
import {
  ACTOR,
  IMPOSSIBLE,
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

describe("attemptExtraction difficulty boundary", () => {
  test("succeeds when the roll reaches the difficulty", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 3, },);

    const result = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
      rngSeed: 12345,
      now: T0,
    },);

    expect(result.succeeded,).toBe(true,);
    expect(result.difficulty,).toBe(TRIVIAL,);
    expect(result.yield,).toHaveLength(1,);
  });

  test("fails when the roll falls below the difficulty", async () => {
    const node = await seedNode(db, { difficulty: IMPOSSIBLE, remaining: 3, },);

    const result = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
      rngSeed: 12345,
      now: T0,
    },);

    expect(result.succeeded,).toBe(false,);
    expect(result.difficulty,).toBe(IMPOSSIBLE,);
    expect(result.yield,).toEqual([],);
  });

  test("a failed extraction consumes NO resource", async () => {
    const node = await seedNode(db, { difficulty: IMPOSSIBLE, remaining: 3, },);

    await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 1, now: T0, },);

    const after = await readNode(db, node,);
    expect(after.remaining_amount,).toBe(3,);
    expect(after.current_uses,).toBe(5,);
    expect(after.state,).toBe(NodeInstanceState.Available,);
    expect(after.respawn_at,).toBeNull();
  });

  test("grants the extracted item to the actor as a world_items instance", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 3, },);

    await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 7, now: T0, },);

    const held = await db
      .selectFrom("world_items",)
      .select(["quantity",],)
      .where("owner_actor_id", "=", ACTOR,)
      .executeTakeFirst();

    expect(held?.quantity,).toBe(1,);
  });
});

describe("attemptExtraction remaining_amount", () => {
  test("decrements on success and stops at zero", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 2, },);

    const first = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
      rngSeed: 3,
      now: T0,
    },);

    expect(first.remaining,).toBe(1,);

    const second = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
      rngSeed: 3,
      now: T0,
    },);

    expect(second.remaining,).toBe(0,);
    expect(second.remaining,).toBeGreaterThanOrEqual(0,);
  });

  test("depletes the node and stamps a respawn on the last unit", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 1, respawnSeconds: 600, },);

    const result = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
      rngSeed: 3,
      now: T0,
    },);

    expect(result.remaining,).toBe(0,);
    const after = await readNode(db, node,);
    expect(after.state,).toBe(NodeInstanceState.Depleted,);
    expect(after.respawn_at,).toBe(new Date(T0.getTime() + 600_000,).toISOString(),);
  });

  test("NULL remaining means infinite and stays NULL across attempts", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: null, },);

    for (const seed of [1, 2, 3, 4, 5,]) {
      const result = await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, {
        rngSeed: seed,
        now: T0,
      },);

      expect(result.succeeded,).toBe(true,);
      expect(result.remaining,).toBeNull();
    }

    const after = await readNode(db, node,);
    expect(after.remaining_amount,).toBeNull();
    expect(after.state,).toBe(NodeInstanceState.Available,);
    expect(after.respawn_at,).toBeNull();
  });
});

describe("attemptExtraction rejection", () => {
  test("refuses a node belonging to another world", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, },);

    await expect(
      attemptExtraction(db, "other-world", LOCATION, node, ACTOR, { rngSeed: 1, now: T0, },),
    ).rejects.toBeInstanceOf(ResourceError,);
  });

  test("refuses a depleted node before it respawns", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 1, },);
    await attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },);

    await expect(
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
    ).rejects.toBeInstanceOf(ResourceError,);
  });
});
