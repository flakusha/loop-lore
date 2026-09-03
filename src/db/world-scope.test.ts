// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the shared world-scoping helpers.
 *
 * - `worldScoped` should append the `WHERE world_id = ?` filter to the
 *   returned Kysely query builder; we exercise that by executing against
 *   a seeded in-memory DB and confirming only in-world rows surface.
 * - `validateWorldAccess` should return true when a `world_members` row
 *   matches `(world_id, actor_id)`, and false otherwise.
 *
 * Each test gets a fresh in-memory SQLite DB via `beforeEach` (FK
 * constraints cascade across tests if we share a handle).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { DB } from "./schema";
import { createTestDb } from "../test-utils/create-test-db";
import { validateWorldAccess, worldScoped } from "./world-scope";

/**
 * `worlds.owner_id` FKs to `users.id`, so seed a minimal users row
 * before the world. `actors.id` is parented by no FK, only needs
 * `display_name`. `crafting_station_defs` / `_instances` both FK into
 * `worlds.id`.
 */
async function seedUser(db: Kysely<DB>, userId: string): Promise<void> {
  await db
    .insertInto("users")
    .values({
      id: userId,
      username: userId,
      display_name: userId,
    })
    .execute();
}

async function seedWorld(db: Kysely<DB>, worldId: string, ownerId: string): Promise<void> {
  await db
    .insertInto("worlds")
    .values({
      id: worldId,
      owner_id: ownerId,
      name: worldId,
    })
    .execute();
}

async function seedActor(db: Kysely<DB>, actorId: string): Promise<void> {
  await db
    .insertInto("actors")
    .values({
      id: actorId,
      display_name: actorId,
    })
    .execute();
}

describe("worldScoped", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const result = await createTestDb();
    db = result.db;
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("filters crafting_station_instances to the requested world", async () => {
    const owner = "owner-" + crypto.randomUUID();
    await seedUser(db, owner);

    const worldA = "world-a-" + crypto.randomUUID();
    const worldB = "world-b-" + crypto.randomUUID();
    await seedWorld(db, worldA, owner);
    await seedWorld(db, worldB, owner);

    const defId = "def-" + crypto.randomUUID();
    await db
      .insertInto("crafting_station_defs")
      .values({
        id: defId,
        world_id: worldA,
        name: "Anvil",
        station_type: "anvil",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    const now = new Date().toISOString();
    const idA = "inst-a-" + crypto.randomUUID();
    const idB = "inst-b-" + crypto.randomUUID();
    await db
      .insertInto("crafting_station_instances")
      .values([
        {
          id: idA,
          station_def_id: defId,
          world_id: worldA,
          current_durability: 10,
          created_at: now,
          updated_at: now,
        },
        {
          id: idB,
          station_def_id: defId,
          world_id: worldB,
          current_durability: 20,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    const rowsA = await worldScoped(db, "crafting_station_instances", worldA)
      .selectAll()
      .execute();
    expect(rowsA.length).toBe(1);
    expect(rowsA[0]?.id).toBe(idA);
    expect(rowsA[0]?.world_id).toBe(worldA);

    const rowsB = await worldScoped(db, "crafting_station_instances", worldB)
      .selectAll()
      .execute();
    expect(rowsB.length).toBe(1);
    expect(rowsB[0]?.id).toBe(idB);
    expect(rowsB[0]?.world_id).toBe(worldB);
  });

  test("returns an empty result for a world with no rows", async () => {
    const rows = await worldScoped(
      db,
      "crafting_station_instances",
      "world-with-no-rows",
    )
      .selectAll()
      .execute();
    expect(rows).toEqual([]);
  });
});

describe("validateWorldAccess", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const result = await createTestDb();
    db = result.db;
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("returns true for a user with a world_members row in the world", async () => {
    const owner = "owner-" + crypto.randomUUID();
    await seedUser(db, owner);

    const worldId = "world-member-" + crypto.randomUUID();
    await seedWorld(db, worldId, owner);

    const userId = "actor-" + crypto.randomUUID();
    await seedActor(db, userId);

    await db
      .insertInto("world_members")
      .values({ world_id: worldId, actor_id: userId })
      .execute();

    const ok = await validateWorldAccess(db, userId, worldId);
    expect(ok).toBe(true);
  });

  test("returns false for a user without a world_members row", async () => {
    const owner = "owner-" + crypto.randomUUID();
    await seedUser(db, owner);

    const worldId = "world-non-member-" + crypto.randomUUID();
    await seedWorld(db, worldId, owner);

    const userId = "actor-not-in-world-" + crypto.randomUUID();
    const otherActorId = "actor-other-" + crypto.randomUUID();
    await seedActor(db, userId);
    await seedActor(db, otherActorId);

    // Seed a row for `otherActorId` but the test will probe `userId`.
    await db
      .insertInto("world_members")
      .values({ world_id: worldId, actor_id: otherActorId })
      .execute();

    const ok = await validateWorldAccess(db, userId, worldId);
    expect(ok).toBe(false);
  });

  test("returns false when the world itself does not exist", async () => {
    const ok = await validateWorldAccess(
      db,
      "actor-doesnt-matter",
      "world-does-not-exist",
    );
    expect(ok).toBe(false);
  });
});
