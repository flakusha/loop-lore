// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service — class-level coverage (index.ts).
 *
 * The dispatcher class in index.ts was only exercised indirectly (buildContext
 * via the context suite). These tests drive every seeding/lookup method
 * against a real DB so the class body is covered on its own.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterWorldSetup,
  insertItems,
  insertLocations,
  insertNpcStates,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { WorldStateService, } from "./index";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
let svc: WorldStateService;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
  svc = new WorldStateService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "World", { id: "world-1", },);
},);

/**
 * @param name - actor display name
 * @param agentType - agent type of the actor
 * @returns the new actor id, already a member of world-1
 */
async function seedWorldMember(name: string, agentType: "ai" | "npc",): Promise<string> {
  const actorId = `actor-${name.toLowerCase()}`;
  await insertActors(db, name, { id: actorId, actor_type: "character", agent_type: agentType, },);
  await insertWorldMembers(db, "world-1", actorId,);
  return actorId;
}

describe("WorldStateService seeding", () => {
  test("initializeNpcStates seeds one row per world character and is idempotent", async () => {
    await seedWorldMember("Hero", "npc",);

    expect(await svc.initializeNpcStates("world-1",),).toBe(1,);
    expect(await svc.initializeNpcStates("world-1",),).toBe(0,);

    const state = await svc.getNpcState("actor-hero", "world-1",);
    expect(state?.health,).toBe(100,);
    expect(state?.mental_state,).toBe("neutral",);
  });

  test("initializeCharacterWorldSetup seeds one row per world character and is idempotent", async () => {
    await seedWorldMember("Hero", "npc",);

    expect(await svc.initializeCharacterWorldSetup("world-1",),).toBe(1,);
    expect(await svc.initializeCharacterWorldSetup("world-1",),).toBe(0,);
  });

  test("seedStartingInventory grants the starting items of a known definition only", async () => {
    const actorId = await seedWorldMember("Hero", "npc",);
    const itemId = await insertItems(db, "world-1", "Sword", "weapon",);
    await insertCharacterWorldSetup(db, actorId, "world-1", {
      starting_inventory: JSON.stringify([
        { item_id: itemId, quantity: 2, },
        { item_id: "item-unknown", quantity: 1, },
      ],),
    },);

    expect(await svc.seedStartingInventory("world-1",),).toBe(1,);
    // Second run must not duplicate the grant.
    expect(await svc.seedStartingInventory("world-1",),).toBe(0,);
  });

  test("initializeLocationStates seeds one row per location and is idempotent", async () => {
    const locId = await insertLocations(db, "world-1", "Tavern",);

    expect(await svc.initializeLocationStates("world-1",),).toBe(1,);
    expect(await svc.initializeLocationStates("world-1",),).toBe(0,);

    const state = await svc.getLocationState(locId,);
    expect(state?.time_of_day,).toBe("morning",);
  });
});

describe("WorldStateService lookups", () => {
  test("snapshot records a world state row and returns its id", async () => {
    const id = await svc.snapshot("world-1",);

    expect(id,).toBeTruthy();
    const row = await db
      .selectFrom("world_states",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();

    expect(row.world_id,).toBe("world-1",);
    expect(row.description,).toBe("Auto-snapshot",);
  });

  test("getNpcState returns undefined for an unknown actor", async () => {
    expect(await svc.getNpcState("actor-nobody", "world-1",),).toBeUndefined();
  });

  test("getNpcsAtLocation lists the NPCs present at a location", async () => {
    const locId = await insertLocations(db, "world-1", "Tavern",);
    const actorId = await seedWorldMember("Hero", "npc",);
    await insertNpcStates(db, actorId, "world-1", { location_id: locId, health: 42, },);

    const present = await svc.getNpcsAtLocation(locId,);
    expect(present.length,).toBe(1,);
    expect(present[0]?.display_name,).toBe("Hero",);
    expect(present[0]?.health,).toBe(42,);

    expect(await svc.getNpcsAtLocation("loc-empty",),).toEqual([],);
  });
});
