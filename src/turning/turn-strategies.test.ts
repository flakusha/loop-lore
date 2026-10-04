import { describe, expect, test, } from "bun:test";
import {
  hybridSelect,
  initiativeSelect,
  questDrivenSelect,
  roundRobinSelect,
  sceneBasedSelect,
  STRATEGY_MAP,
} from "./turn-strategies";

import { TurnStrategy, } from "../db/enums";
import type { TurnParticipant, } from "./types";

const participants: TurnParticipant[] = [
  { actorId: "a1", type: "character", agentType: "ai", talkativity: 5, },
  { actorId: "a2", type: "character", agentType: "ai", talkativity: 3, },
  { actorId: "a3", type: "character", agentType: "narrator", talkativity: 1, },
];

const turnOrder = ["a1", "a2", "a3",];

describe("Turn Strategies", () => {
  describe("roundRobinSelect", () => {
    test("selects first participant when no current actor", () => {
      const result = roundRobinSelect(participants, null, 0, turnOrder,);
      expect(result,).toBe("a1",);
    });

    test("cycles to next participant", () => {
      const result = roundRobinSelect(participants, "a1", 1, turnOrder,);
      expect(result,).toBe("a2",);
    });

    test("wraps around to first after last", () => {
      const result = roundRobinSelect(participants, "a3", 3, turnOrder,);
      expect(result,).toBe("a1",);
    });

    test("rotation follows turnOrder, not participants array order", () => {
      // Participants listed [a1, a2, a3] but the caller-owned order is
      // reversed: after "a3" comes "a2", not "a1". A participants-array
      // cycle would return "a1" here.
      const result = roundRobinSelect(participants, "a3", 3, ["a1", "a3", "a2",], undefined, null,);
      expect(result,).toBe("a2",);
    });

    test("guard advances past the previous speaker within turnOrder", () => {
      // After "a1" the order schedules "a2", but "a2" spoke last and
      // alternatives exist → advance to "a3".
      const result = roundRobinSelect(participants, "a1", 1, turnOrder, undefined, "a2",);
      expect(result,).toBe("a3",);
    });

    test("stale turnOrder falls back to first non-last participant", () => {
      const result = roundRobinSelect(participants, "a1", 1, ["gone-1", "gone-2",], undefined, "a1",);
      expect(result,).toBe("a2",);
    });
  });

  describe("sceneBasedSelect", () => {
    test("selects narrator on every 3rd turn (turn % 3 === 0)", () => {
      const result = sceneBasedSelect(participants, "a1", 0, turnOrder,);
      expect(result,).toBe("a3",);
    });

    test("falls back to round-robin on non-3rd turns", () => {
      const result = sceneBasedSelect(participants, "a1", 1, turnOrder,);
      expect(result,).toBe("a2",);
    });

    test("uses round-robin when no narrator present", () => {
      const noNarrator = participants.filter((p,) => p.agentType !== "narrator");
      const result = sceneBasedSelect(noNarrator, "a1", 0, ["a1", "a2",],);
      expect(result,).toBe("a2",);
    });
  });

  describe("initiativeSelect", () => {
    test("returns a valid participant ID", () => {
      const result = initiativeSelect(participants, null, 0, turnOrder,);
      expect(participants.some((p,) => p.actorId === result),).toBe(true,);
    });

    test("returns the only participant when只有一个", () => {
      const single = [participants[0]!,];
      const result = initiativeSelect(single, null, 0, ["a1",],);
      expect(result,).toBe("a1",);
    });
  });

  describe("questDrivenSelect", () => {
    test("delegates to round-robin", () => {
      const rr = roundRobinSelect(participants, "a1", 1, turnOrder,);
      const qd = questDrivenSelect(participants, "a1", 1, turnOrder,);
      expect(qd,).toBe(rr,);
    });
  });

  describe("hybridSelect", () => {
    test("group mode: uses mentioned actor if provided", () => {
      const ctx = { chatMode: "group" as const, isPaused: false, mentionedActorId: "a2", };
      const result = hybridSelect(participants, "a1", 1, turnOrder, ctx,);
      expect(result,).toBe("a2",);
    });

    test("group mode: falls back to weighted random without mention", () => {
      const ctx = { chatMode: "group" as const, isPaused: false, };
      const result = hybridSelect(participants, "a1", 1, turnOrder, ctx,);
      expect(participants.some((p,) => p.actorId === result),).toBe(true,);
    });

    test("story mode: uses quest-driven on turn % 5 === 0", () => {
      const result = hybridSelect(participants, "a1", 0, turnOrder,);
      // turn 0 % 5 === 0 → quest-driven → round-robin → next after a1
      expect(result,).toBe("a2",);
    });

    test("story mode: uses scene-based on other turns", () => {
      // turn 1 % 5 !== 0 → scene-based → round-robin (not 3rd turn)
      const result = hybridSelect(participants, "a1", 1, turnOrder,);
      expect(result,).toBe("a2",);
    });
  });

  describe("STRATEGY_MAP", () => {
    test("maps all TurnStrategy values to functions", () => {
      expect(STRATEGY_MAP[TurnStrategy.RoundRobin],).toBe(roundRobinSelect,);
      expect(STRATEGY_MAP[TurnStrategy.SceneBased],).toBe(sceneBasedSelect,);
      expect(STRATEGY_MAP[TurnStrategy.Initiative],).toBe(initiativeSelect,);
      expect(STRATEGY_MAP[TurnStrategy.QuestDriven],).toBe(questDrivenSelect,);
      expect(STRATEGY_MAP[TurnStrategy.Hybrid],).toBe(hybridSelect,);
    });

    test("every strategy is a function", () => {
      for (const [, fn,] of Object.entries(STRATEGY_MAP,)) {
        expect(typeof fn,).toBe("function",);
      }
    });
  });
});

describe("deterministic replay + talkativity weighting (turn-talkativity-skip AC1/AC2)", () => {
  test("round-robin is deterministic across calls and blind to talkativity", () => {
    const first = roundRobinSelect(participants, "a1", 1, turnOrder,);
    const second = roundRobinSelect(participants, "a1", 1, turnOrder,);
    expect(first,).toBe("a2",);
    expect(second,).toBe(first,);

    // Talkativity must not perturb a non-weighted strategy: zero out every
    // weight and the same slot still wins.
    const reweighted = participants.map((p,) => {
      return { ...p, talkativity: 0, };
    },);

    expect(roundRobinSelect(reweighted, "a1", 1, turnOrder,),).toBe(first,);
  });

  test("scene-based selection is pure (same inputs, same output)", () => {
    const ctx = { chatMode: "group" as const, isPaused: false, };
    const a = sceneBasedSelect(participants, "a1", 1, turnOrder, ctx,);
    const b = sceneBasedSelect(participants, "a1", 1, turnOrder, ctx,);
    expect(a,).toBe(b,);
  });

  test("talkativity weights shift hybrid group selection probability", () => {
    const loud: TurnParticipant = { actorId: "loud", type: "character", agentType: "ai", talkativity: 100, };
    const quiet: TurnParticipant = { actorId: "quiet", type: "character", agentType: "ai", talkativity: 1, };
    const ctx = { chatMode: "group" as const, isPaused: false, };
    let loudCount = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      const picked = hybridSelect([loud, quiet,], null, attempt, [], ctx,);
      expect(["loud", "quiet",],).toContain(picked,);
      if (picked === "loud") {
        loudCount++;
      }
    }

    // 100:1 weight → expected loud picks ≈ 49.5/50; the assertion floor
    // (40) still fails with overwhelming probability if weights are ignored
    // (fair coin → P(≥40 of 50) ≈ 2.6e-10).
    expect(loudCount,).toBeGreaterThanOrEqual(40,);
  });
});
