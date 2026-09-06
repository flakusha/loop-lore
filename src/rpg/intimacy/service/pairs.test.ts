import { describe, expect, it, } from "bun:test";
import { rowToPair, } from "./pairs";

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
});
