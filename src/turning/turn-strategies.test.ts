import { describe, expect, test } from "bun:test";
import {
  hybridSelect,
  initiativeSelect,
  questDrivenSelect,
  roundRobinSelect,
  sceneBasedSelect,
  STRATEGY_MAP,
} from "./turn-strategies";

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
