// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `carryWorldState`
 * (src/chat/service/carry-world-state.ts).
 *
 * Contract: world_states / npc_states / location_states rows scoped to the
 * source world are duplicated into the target world with fresh ids; source
 * rows remain intact; an empty source world is a no-op.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
  insertWorldStates,
} from "../../test-utils/insert-helpers";
import { carryWorldState, } from "./carry-world-state";

describe("carryWorldState", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const npcActorId = crypto.randomUUID();
  const sourceWorldId = crypto.randomUUID();
  const targetWorldId = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, "carry-world-user", "Carry World User", { id: userId, } as never,);
    await insertActors(db, "Carry NPC", { id: npcActorId, owner_id: userId, } as never,);
    await insertWorlds(db, userId, "Source World", { id: sourceWorldId, } as never,);
    await insertWorlds(db, userId, "Target World", { id: targetWorldId, } as never,);

    await insertWorldStates(db, sourceWorldId, '{"weather":"rain"}', {
      id: "ws-src-1",
      description: "storm state",
    } as never,);
    await insertLocations(db, sourceWorldId, "Tavern", { id: locationId, } as never,);
    await insertNpcStates(db, npcActorId, sourceWorldId, {
      id: "npc-src-1",
      health: 7,
      mental_state: "calm",
      location_id: locationId,
    } as never,);
    await insertLocationStates(db, locationId, sourceWorldId, {
      id: "loc-src-1",
      atmosphere: "tense",
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("duplicates world/npc/location state rows into the target world", async () => {
    await carryWorldState(db, sourceWorldId, targetWorldId,);

    const worldStates = await db
      .selectFrom("world_states",).selectAll()
      .where("world_id", "=", targetWorldId,).execute();
    expect(worldStates,).toHaveLength(1,);
    expect(worldStates[0]?.snapshot,).toBe('{"weather":"rain"}',);
    expect(worldStates[0]?.description,).toBe("storm state",);
    expect(worldStates[0]?.id,).not.toBe("ws-src-1",);

    const npcStates = await db
      .selectFrom("npc_states",).selectAll()
      .where("world_id", "=", targetWorldId,).execute();
    expect(npcStates,).toHaveLength(1,);
    expect(npcStates[0]?.actor_id,).toBe(npcActorId,);
    expect(npcStates[0]?.health,).toBe(7,);
    expect(npcStates[0]?.location_id,).toBe(locationId,);

    const locationStates = await db
      .selectFrom("location_states",).selectAll()
      .where("world_id", "=", targetWorldId,).execute();
    expect(locationStates,).toHaveLength(1,);
    expect(locationStates[0]?.location_id,).toBe(locationId,);
    expect(locationStates[0]?.atmosphere,).toBe("tense",);
  });

  test("source world rows remain intact after the carry", async () => {
    expect(
      await db.selectFrom("world_states",).selectAll().where("world_id", "=", sourceWorldId,).execute(),
    ).toHaveLength(1,);
    expect(
      await db.selectFrom("npc_states",).selectAll().where("world_id", "=", sourceWorldId,).execute(),
    ).toHaveLength(1,);
    expect(
      await db.selectFrom("location_states",).selectAll().where("world_id", "=", sourceWorldId,).execute(),
    ).toHaveLength(1,);
  });

  test("no-op for a world with no state rows", async () => {
    const emptyWorldId = crypto.randomUUID();
    await insertWorlds(db, userId, "Empty World", { id: emptyWorldId, } as never,);

    await carryWorldState(db, emptyWorldId, targetWorldId,);

    expect(
      await db.selectFrom("world_states",).selectAll().where("world_id", "=", targetWorldId,).execute(),
    ).toHaveLength(1,);
  });
});
