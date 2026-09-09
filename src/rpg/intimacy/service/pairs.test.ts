import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { getActorPairs, rowToPair, } from "./pairs";

describe("rpg/intimacy/service/pairs (real logic)", () => {
  it("rowToPair transforms DB row to IntimacyPair", () => {
    const row = {
      id: "p1",
      actor_id: "a1",
      target_actor_id: "a2",
      world_id: "w1",
      score: 42,
      action_history: "[]",
      unlocked_thresholds: "[]",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const pair = rowToPair(row,);
    expect(pair.id,).toBe("p1",);
    expect(pair.actorId,).toBe("a1",);
    expect(pair.score,).toBe(42,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("rowToPair returns null worldId when world_id is null", () => {
    const row = {
      id: "p2",
      actor_id: "a1",
      target_actor_id: "a2",
      world_id: null,
      score: 0,
      action_history: "[]",
      unlocked_thresholds: "[]",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const pair = rowToPair(row,);
    expect(pair.worldId,).toBeNull();
  });

  it("rowToPair parses non-empty action_history JSON", () => {
    const row = {
      id: "p3",
      actor_id: "a1",
      target_actor_id: "a2",
      world_id: null,
      score: 10,
      action_history: JSON.stringify([
        { actionId: "g1", actionName: "Gift", delta: 10, timestamp: "2026-01-01", },
      ],),
      unlocked_thresholds: "[10]",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const pair = rowToPair(row,);
    expect(pair.actionHistory.length,).toBe(1,);
    expect(pair.actionHistory[0]!.actionName,).toBe("Gift",);
    expect(pair.unlockedThresholds,).toEqual([10,],);
  });

  it("rowToPair falls back to [] on malformed JSON", () => {
    const row = {
      id: "p4",
      actor_id: "a1",
      target_actor_id: "a2",
      world_id: null,
      score: 0,
      action_history: "not-json",
      unlocked_thresholds: "also-not-json",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const pair = rowToPair(row,);
    expect(pair.actionHistory,).toEqual([],);
    expect(pair.unlockedThresholds,).toEqual([],);
  });

  it("rowToPair accepts a negative score (no clamping at this layer)", () => {
    const row = {
      id: "p5",
      actor_id: "a1",
      target_actor_id: "a2",
      world_id: null,
      score: -50,
      action_history: "[]",
      unlocked_thresholds: "[]",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const pair = rowToPair(row,);
    expect(pair.score,).toBe(-50,);
  });

  it("getActorPairs returns empty array for an actor with no pairs", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Solo", { id: "solo-actor", } as never,);
    const pairs = await getActorPairs(db, "solo-actor",);
    expect(pairs,).toEqual([],);
  });

  it("getActorPairs sorts by score desc", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "A", { id: "actor-a", } as never,);
    await insertActors(db, "B", { id: "actor-b", } as never,);
    await insertActors(db, "C", { id: "actor-c", } as never,);

    // Seed three pairs with different scores.
    const now = new Date().toISOString();
    await db.insertInto("character_intimacy",).values([
      {
        id: "p1",
        actor_id: "actor-a",
        target_actor_id: "actor-b",
        world_id: null,
        score: 30,
        action_history: "[]",
        unlocked_thresholds: "[]",
        created_at: now,
        updated_at: now,
      },
      {
        id: "p2",
        actor_id: "actor-a",
        target_actor_id: "actor-c",
        world_id: null,
        score: 80,
        action_history: "[]",
        unlocked_thresholds: "[]",
        created_at: now,
        updated_at: now,
      },
    ],).execute();

    const pairs = await getActorPairs(db, "actor-a",);
    expect(pairs.length,).toBe(2,);
    expect(pairs[0]!.score,).toBe(80,);
    expect(pairs[1]!.score,).toBe(30,);
  });
});
