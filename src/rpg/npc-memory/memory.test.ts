// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/npc-memory/memory.test.ts — record/recall/reinforce round-trips and
 * the relationship band machine. Every timestamp is injected, so the clock
 * only moves when a test moves it.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import {
  computeRelationshipType,
  recallMemories,
  recordMemory,
  reinforceMemory,
  updateRelationship,
} from "./index";

let db: Kysely<DB>;
let clockMs: number;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  await insertActors(db, "Innkeeper", { id: "npc-1", },);
  await insertActors(db, "Blacksmith", { id: "npc-2", },);
  clockMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
},);

afterEach(async () => {
  await db.destroy();
},);

function now(): Date {
  return new Date(clockMs,);
}

type MemoryOverrides = Partial<Parameters<typeof recordMemory>[0]["memory"]>;

async function addMemory(overrides: MemoryOverrides = {},) {
  return recordMemory({
    db,
    worldId: "w1",
    npcId: "npc-1",
    memory: { content: "met the traveller", ...overrides, },
    now: now(),
  },);
}

describe("recordMemory", () => {
  test("stamps both clock columns and defaults the rest", async () => {
    const row = await addMemory();
    expect(row.created_at,).toBe(now().toISOString(),);
    expect(row.last_reinforced_at,).toBe(now().toISOString(),);
    expect(row.memory_type,).toBe("episodic",);
    expect(row.importance,).toBe(50,);
    expect(row.shared,).toBe(0,);
    expect(row.participants,).toBe("[]",);
  });

  test("rejects blank content", async () => {
    await expect(addMemory({ content: "   ", },),).rejects.toThrow(/must not be blank/,);
  });

  test("stores participants as a JSON array", async () => {
    const row = await addMemory({ participants: ["npc-1", "actor-2",], },);
    expect(JSON.parse(row.participants,),).toEqual(["npc-1", "actor-2",],);
  });
});

describe("recallMemories", () => {
  test("orders by importance descending and honours the limit", async () => {
    await addMemory({ content: "low", importance: 10, },);
    await addMemory({ content: "high", importance: 90, },);
    await addMemory({ content: "mid", importance: 50, },);

    const all = await recallMemories({ db, worldId: "w1", npcId: "npc-1", },);
    expect(all.map((m,) => m.content),).toEqual(["high", "mid", "low",],);

    const limited = await recallMemories({ db, worldId: "w1", npcId: "npc-1", limit: 2, },);
    expect(limited.map((m,) => m.content),).toEqual(["high", "mid",],);
  });

  test("drops fully-faded and expired rows", async () => {
    const stale = await addMemory({ content: "stale", importance: 90, },);
    await addMemory({ content: "fresh", importance: 10, expiresAt: "2099-01-01T00:00:00.000Z", },);
    await db.updateTable("npc_memories",).set({ importance: 0, },).where("id", "=", stale.id,).execute();
    await addMemory({ content: "expired", importance: 90, expiresAt: "2020-01-01T00:00:00.000Z", },);

    const recalled = await recallMemories({ db, worldId: "w1", npcId: "npc-1", },);
    expect(recalled.map((m,) => m.content),).toEqual(["fresh",],);
  });

  test("scopes to one NPC and one world", async () => {
    await addMemory({ content: "mine", },);
    await recordMemory({
      db,
      worldId: "w1",
      npcId: "npc-2",
      memory: { content: "theirs", },
      now: now(),
    },);

    const recalled = await recallMemories({ db, worldId: "w1", npcId: "npc-1", },);
    expect(recalled.map((m,) => m.content),).toEqual(["mine",],);
  });
});

describe("reinforceMemory", () => {
  test("moves the decay clock forward and bumps importance", async () => {
    const row = await addMemory({ importance: 40, },);
    clockMs += 5 * 86_400_000;

    const reinforced = await reinforceMemory(db, row.id, now(),);
    expect(reinforced.last_reinforced_at,).toBe(now().toISOString(),);
    expect(reinforced.importance,).toBe(41,);
  });

  test("throws for an unknown memory", async () => {
    await expect(reinforceMemory(db, "missing", now(),),).rejects.toThrow(/no memory with id/,);
  });
});

describe("computeRelationshipType", () => {
  test("moves through every band as standing crosses its thresholds", () => {
    expect(computeRelationshipType({ standing: 0, bond: 0, },),).toBe("stranger",);
    expect(computeRelationshipType({ standing: 10, bond: 10, },),).toBe("acquaintance",);
    expect(computeRelationshipType({ standing: 40, bond: 40, },),).toBe("friend",);
    expect(computeRelationshipType({ standing: 75, bond: 75, },),).toBe("ally",);
    expect(computeRelationshipType({ standing: -25, bond: -25, },),).toBe("rival",);
    expect(computeRelationshipType({ standing: -75, bond: -75, },),).toBe("enemy",);
  });

  test("a deep grudge wins over a warm bond", () => {
    expect(computeRelationshipType({ standing: -80, bond: 90, },),).toBe("enemy",);
  });
});

describe("updateRelationship", () => {
  test("seeds a row on first contact and records the delta in history", async () => {
    const row = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-2",
      delta: 10,
      now: now(),
    },);

    expect(row.standing,).toBe(10,);
    expect(row.emotional_bond,).toBe(10,);
    expect(row.relationship_type,).toBe("acquaintance",);
    expect(JSON.parse(row.history,),).toEqual([{ at: now().toISOString(), delta: 10, },],);
  });

  test("crossing a threshold changes the stored relationship_type", async () => {
    await updateRelationship({ db, worldId: "w1", npcId: "npc-1", targetId: "actor-2", delta: 30, now: now(), },);
    const mid = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-2",
      delta: 15,
      now: now(),
    },);

    expect(mid.standing,).toBe(45,);
    expect(mid.relationship_type,).toBe("friend",);

    const top = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-2",
      delta: 35,
      now: now(),
    },);

    expect(top.standing,).toBe(80,);
    expect(top.relationship_type,).toBe("ally",);

    const persisted = await db.selectFrom("npc_relationships",).selectAll().executeTakeFirst();
    expect(persisted?.relationship_type,).toBe("ally",);
  });

  test("clamps standing at both ends of the band", async () => {
    const hot = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-2",
      delta: 500,
      now: now(),
    },);

    expect(hot.standing,).toBe(100,);

    const cold = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-3",
      delta: -500,
      now: now(),
    },);

    expect(cold.standing,).toBe(-100,);
    expect(cold.relationship_type,).toBe("enemy",);
  });

  test("accepts a non-actor target and keeps pairs separate", async () => {
    await updateRelationship({ db, worldId: "w1", npcId: "npc-1", targetId: "goblin-warband", delta: 5, now: now(), },);
    const other = await updateRelationship({
      db,
      worldId: "w1",
      npcId: "npc-1",
      targetId: "actor-2",
      delta: 5,
      now: now(),
    },);

    expect(other.target_id,).toBe("actor-2",);
    const count = await db.selectFrom("npc_relationships",).selectAll().execute();
    expect(count.length,).toBe(2,);
  });
});
