// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC decision coverage — negotiate/defend/flee/attack selection across
 * health bands, outnumbered states, and battle-memory modifiers, plus
 * reasoning text for every reachable branch.
 */
import { describe, expect, test, } from "bun:test";
import { makeNPCDecision, } from "./decision.js";
import type { NPCBattleMemory, NPCPersonality, } from "./types.js";

const ZERO: NPCPersonality = {
  aggression: 0,
  caution: 0,
  loyalty: 0,
  intelligence: 0,
  courage: 0,
};

/**
 * @param outcome
 * @param impact
 */
function defeat(impact: number,): NPCBattleMemory {
  return {
    battleId: "b",
    timestamp: new Date().toISOString(),
    outcome: "defeat",
    opponents: ["o",],
    lessons: [],
    emotionalImpact: impact,
  };
}

describe("makeNPCDecision — branch coverage", () => {
  test("negotiates when only diplomacy has weight (smart + loyal)", () => {
    const d = makeNPCDecision(
      { ...ZERO, intelligence: 50, loyalty: 100, courage: 100, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("negotiate",);
    expect(d.reasoning,).toBe("Values relationships over violence",);
  });

  test("negotiates with the intelligent reasoning when loyalty is low", () => {
    const d = makeNPCDecision(
      { ...ZERO, intelligence: 80, loyalty: 50, courage: 100, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("negotiate",);
    expect(d.reasoning,).toBe("Intelligent approach to avoid conflict",);
  });

  test("negotiates with the generic line for average diplomats", () => {
    const d = makeNPCDecision(
      { ...ZERO, intelligence: 50, loyalty: 50, courage: 100, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("negotiate",);
    expect(d.reasoning,).toBe("Seeks diplomatic solution",);
  });

  test("defends with cautious reasoning at full health", () => {
    const d = makeNPCDecision(
      { ...ZERO, caution: 100, courage: 100, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("defend",);
    expect(d.reasoning,).toBe("Cautious nature favors defense",);
  });

  test("wounded defender cites self-protection", () => {
    const d = makeNPCDecision(
      { ...ZERO, caution: 60, courage: 100, },
      30,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("defend",);
    expect(d.reasoning,).toBe("Wounded, needs to protect self",);
  });

  test("generic defender line for mild caution", () => {
    const d = makeNPCDecision(
      { ...ZERO, caution: 40, courage: 100, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("defend",);
    expect(d.reasoning,).toBe("Defensive posture chosen",);
  });

  test("outnumbered coward retreats tactically", () => {
    const d = makeNPCDecision({ ...ZERO, courage: 50, }, 100, 100, 3, 1, [],);
    expect(d.type,).toBe("flee",);
    expect(d.reasoning,).toBe("Outnumbered, tactical retreat",);
  });

  test("spineless NPC flees even on even ground", () => {
    const d = makeNPCDecision({ ...ZERO, courage: 10, }, 100, 100, 1, 1, [],);
    expect(d.type,).toBe("flee",);
    expect(d.reasoning,).toBe("Low courage prompts retreat",);
  });

  test("unfavorable odds produce the generic retreat line", () => {
    const d = makeNPCDecision({ ...ZERO, courage: 50, }, 10, 100, 1, 1, [],);
    expect(d.type,).toBe("flee",);
    expect(d.reasoning,).toBe("Assesses situation as unfavorable",);
  });

  test("aggressive brute attacks head-on", () => {
    const d = makeNPCDecision(
      { ...ZERO, aggression: 80, courage: 50, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("attack",);
    expect(d.reasoning,).toBe("Aggressive personality drives attack",);
  });

  test("fearless knight attacks on courage", () => {
    const d = makeNPCDecision(
      { ...ZERO, aggression: 60, courage: 90, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("attack",);
    expect(d.reasoning,).toBe("High courage emboldens attack",);
  });

  test("opportunist attacks without a strong trait", () => {
    const d = makeNPCDecision(
      { ...ZERO, aggression: 60, courage: 50, },
      100,
      100,
      1,
      1,
      [],
    );
    expect(d.type,).toBe("attack",);
    expect(d.reasoning,).toBe("Sees opportunity to strike",);
  });

  test("heavy defeats tilt an attacker into defense", () => {
    const fighter: NPCPersonality = { ...ZERO, aggression: 50, courage: 50, caution: 70, };
    const bold = makeNPCDecision(fighter, 100, 100, 1, 1, [],);
    expect(bold.type,).toBe("attack",);
    const scarred = makeNPCDecision(fighter, 100, 100, 1, 1, [defeat(-30,), defeat(-30,), defeat(-30,),],);
    expect(scarred.type,).toBe("defend",);
  });

  test("critical health doubles flee weight for a balanced fighter", () => {
    const fighter: NPCPersonality = {
      aggression: 50,
      caution: 10,
      loyalty: 10,
      intelligence: 10,
      courage: 50,
    };
    const healthy = makeNPCDecision(fighter, 100, 100, 1, 1, [],);
    expect(healthy.type,).toBe("attack",);
    const dying = makeNPCDecision(fighter, 10, 100, 1, 1, [],);
    expect(dying.type,).toBe("flee",);
  });

  test("confidence always stays within 0–100 with non-empty reasoning", () => {
    const cases: [NPCPersonality, number, number, number, NPCBattleMemory[],][] = [
      [{ ...ZERO, aggression: 100, courage: 100, }, 100, 5, 1, [],],
      [{ ...ZERO, caution: 100, }, 1, 5, 5, [defeat(-100,),],],
      [{ ...ZERO, intelligence: 100, loyalty: 100, courage: 100, }, 75, 2, 2, [],],
    ];
    for (const [p, hp, enemies, allies, mems,] of cases) {
      const d = makeNPCDecision(p, hp, 100, enemies, allies, mems,);
      expect(d.confidence,).toBeGreaterThanOrEqual(0,);
      expect(d.confidence,).toBeLessThanOrEqual(100,);
      expect(d.reasoning.length,).toBeGreaterThan(0,);
    }
  });
});
