// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World-state init coverage — NPC/location setup seeding, character setup
 * rows, and starting-inventory grants, including idempotency, agent-type
 * filtering, unknown definitions, and damaged inventory blobs.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { WorldState, } from "./types";
import {
  initializeCharacterWorldSetup,
  initializeLocationStates,
  initializeNpcStates,
  seedStartingInventory,
} from "./init";

let db: Kysely<DB>;
let state: WorldState;
let worldId: string;
let userId: string;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  ({ db, } = await createTestDb());
  state = { db, };
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Init World", { id: worldId, } as never,);
},);

afterEach(async () => {
  await db.destroy();
},);

/**
 * @param name
 * @param actorType
 * @param agentType
 */
async function member(name: string, actorType: string, agentType: string,): Promise<string> {
  const id = uid();
  await insertActors(db, name, {
    id,
    actor_type: actorType,
    agent_type: agentType,
  } as never,);
  await insertWorldMembers(db, worldId, id,);
  return id;
}

/** */
async function npcCount(): Promise<number> {
  const rows = await db.selectFrom("npc_states",).select("id",).where("world_id", "=", worldId,).execute();
  return rows.length;
}

describe("initializeNpcStates", () => {
  test("seeds one row per eligible character and reports the count", async () => {
    await member("Goblin", "character", "npc",);
    await member("Narrator", "narrator", "ai",);
    expect(await initializeNpcStates(state, worldId,),).toBe(2,);
    expect(await npcCount(),).toBe(2,);
  });

  test("skips ineligible actor types (user-owned personas, system actors)", async () => {
    await member("Player", "character", "human",);
    await member("System", "system", "system",);
    expect(await initializeNpcStates(state, worldId,),).toBe(0,);
    expect(await npcCount(),).toBe(0,);
  });

  test("is idempotent — reruns skip existing rows", async () => {
    await member("Goblin", "character", "npc",);
    expect(await initializeNpcStates(state, worldId,),).toBe(1,);
    expect(await initializeNpcStates(state, worldId,),).toBe(0,);
    expect(await npcCount(),).toBe(1,);
  });

  test("empty world seeds nothing", async () => {
    expect(await initializeNpcStates(state, worldId,),).toBe(0,);
  });

  test("FK-violating world id seeds nothing", async () => {
    await member("Goblin", "character", "npc",);
    expect(await initializeNpcStates(state, uid(),),).toBe(0,);
  });
});

describe("initializeCharacterWorldSetup", () => {
  test("seeds setup rows with empty defaults", async () => {
    const actor = await member("Goblin", "character", "npc",);
    expect(await initializeCharacterWorldSetup(state, worldId,),).toBe(1,);
    const row = await db
      .selectFrom("character_world_setup",)
      .select(["starting_inventory", "lore_entries", "initial_state",],)
      .where("actor_id", "=", actor,)
      .executeTakeFirstOrThrow();
    expect(row.starting_inventory,).toBe("[]",);
    expect(row.lore_entries,).toBe("[]",);
    expect(row.initial_state,).toBe("{}",);
  });

  test("is idempotent across reruns", async () => {
    await member("Goblin", "character", "npc",);
    expect(await initializeCharacterWorldSetup(state, worldId,),).toBe(1,);
    expect(await initializeCharacterWorldSetup(state, worldId,),).toBe(0,);
  });

  test("empty world seeds nothing", async () => {
    expect(await initializeCharacterWorldSetup(state, worldId,),).toBe(0,);
  });
});

describe("seedStartingInventory", () => {
  test("grants listed items the actor does not yet carry", async () => {
    const actor = await member("Goblin", "character", "npc",);
    await initializeCharacterWorldSetup(state, worldId,);
    const defId = uid();
    await insertItems(db, worldId, "Torch", "tool", { id: defId, } as never,);
    await db
      .updateTable("character_world_setup",)
      .set({ starting_inventory: JSON.stringify([{ item_id: defId, quantity: 2, },]), },)
      .where("actor_id", "=", actor,)
      .where("world_id", "=", worldId,)
      .execute();

    expect(await seedStartingInventory(state, worldId,),).toBe(1,);
    const row = await db
      .selectFrom("world_items",)
      .select(["quantity", "owner_actor_id",],)
      .where("item_id", "=", defId,)
      .executeTakeFirstOrThrow();
    expect(row.quantity,).toBe(2,);
    expect(row.owner_actor_id,).toBe(actor,);
  });

  test("skips definitions that do not exist in the world", async () => {
    await member("Goblin", "character", "npc",);
    await initializeCharacterWorldSetup(state, worldId,);
    await db
      .updateTable("character_world_setup",)
      .set({ starting_inventory: JSON.stringify([{ item_id: uid(), quantity: 1, },]), },)
      .where("world_id", "=", worldId,)
      .execute();
    expect(await seedStartingInventory(state, worldId,),).toBe(0,);
  });

  test("skips actors that already carry items (idempotent join)", async () => {
    const actor = await member("Goblin", "character", "npc",);
    await initializeCharacterWorldSetup(state, worldId,);
    const defId = uid();
    await insertItems(db, worldId, "Torch", "tool", { id: defId, } as never,);
    await db
      .updateTable("character_world_setup",)
      .set({ starting_inventory: JSON.stringify([{ item_id: defId, quantity: 1, },]), },)
      .where("actor_id", "=", actor,)
      .execute();
    expect(await seedStartingInventory(state, worldId,),).toBe(1,);
    // Second run: the actor now carries items, so nothing more is granted.
    expect(await seedStartingInventory(state, worldId,),).toBe(0,);
  });

  test("non-positive quantities grant a single item", async () => {
    await member("Goblin", "character", "npc",);
    await initializeCharacterWorldSetup(state, worldId,);
    const defId = uid();
    await insertItems(db, worldId, "Torch", "tool", { id: defId, } as never,);
    await db
      .updateTable("character_world_setup",)
      .set({ starting_inventory: JSON.stringify([{ item_id: defId, quantity: 0, },]), },)
      .where("world_id", "=", worldId,)
      .execute();
    expect(await seedStartingInventory(state, worldId,),).toBe(1,);
    const row = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("item_id", "=", defId,)
      .executeTakeFirstOrThrow();
    expect(row.quantity,).toBe(1,);
  });

  test("damaged data — corrupt inventory blob grants nothing", async () => {
    await member("Goblin", "character", "npc",);
    await initializeCharacterWorldSetup(state, worldId,);
    await db
      .updateTable("character_world_setup",)
      .set({ starting_inventory: "{not-json", },)
      .where("world_id", "=", worldId,)
      .execute();
    expect(await seedStartingInventory(state, worldId,),).toBe(0,);
  });

  test("empty setup table grants nothing", async () => {
    expect(await seedStartingInventory(state, worldId,),).toBe(0,);
  });
});

describe("initializeLocationStates", () => {
  test("seeds morning states for every location", async () => {
    const a = uid();
    const b = uid();
    await insertLocations(db, worldId, "Gate", { id: a, } as never,);
    await insertLocations(db, worldId, "Keep", { id: b, } as never,);
    expect(await initializeLocationStates(state, worldId,),).toBe(2,);
    const rows = await db
      .selectFrom("location_states",)
      .select(["location_id", "time_of_day", "npcs_present", "hazards",],)
      .where("world_id", "=", worldId,)
      .execute();
    expect(rows,).toHaveLength(2,);
    for (const r of rows) {
      expect(r.time_of_day,).toBe("morning",);
      expect(r.npcs_present,).toBe("[]",);
      expect(r.hazards,).toBe("[]",);
    }
  });

  test("is idempotent across reruns", async () => {
    await insertLocations(db, worldId, "Gate", {} as never,);
    expect(await initializeLocationStates(state, worldId,),).toBe(1,);
    expect(await initializeLocationStates(state, worldId,),).toBe(0,);
  });

  test("world without locations seeds nothing", async () => {
    expect(await initializeLocationStates(state, worldId,),).toBe(0,);
  });
});
