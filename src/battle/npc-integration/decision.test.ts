// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { makeNPCDecision, } from "./decision.ts";
import type { NPCBattleMemory, NPCPersonality, } from "./types.ts";

function personality(overrides: Partial<NPCPersonality> = {},): NPCPersonality {
  return {
    aggression: 50,
    caution: 50,
    loyalty: 50,
    intelligence: 50,
    courage: 50,
    ...overrides,
  };
}

function defeat(battleId: string, emotionalImpact: number,): NPCBattleMemory {
  return {
    battleId,
    timestamp: new Date().toISOString(),
    outcome: "defeat",
    opponents: ["orc-1",],
    lessons: ["shield wall holds",],
    emotionalImpact,
  };
}

describe("makeNPCDecision", () => {
  test("max aggression at full health with allies chooses attack", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 100, courage: 100, caution: 0, intelligence: 0, loyalty: 0, },),
      100,
      100,
      1,
      5,
      [],
    );
    expect(decision.type,).toBe("attack",);
    expect(decision.reasoning,).toBe("Aggressive personality drives attack",);
    expect(decision.confidence,).toBe(100,);
  });

  test("coward at low health while outnumbered chooses flee", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 0, courage: 10, caution: 0, intelligence: 0, loyalty: 0, },),
      10,
      100,
      5,
      1,
      [],
    );
    expect(decision.type,).toBe("flee",);
    expect(decision.reasoning,).toBe("Low courage prompts retreat",);
  });

  test("cautious NPC at full health chooses defend", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 0, courage: 100, caution: 100, intelligence: 0, loyalty: 0, },),
      100,
      100,
      1,
      1,
      [],
    );
    expect(decision.type,).toBe("defend",);
    expect(decision.reasoning,).toBe("Cautious nature favors defense",);
  });

  test("brilliant loyalist chooses negotiate", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 0, courage: 100, caution: 0, intelligence: 100, loyalty: 100, },),
      100,
      100,
      1,
      1,
      [],
    );
    expect(decision.type,).toBe("negotiate",);
    expect(decision.reasoning,).toBe("Intelligent approach to avoid conflict",);
  });

  test("recent defeats shift a close call from defend to attack", () => {
    const p = personality({ aggression: 50, courage: 50, caution: 80, intelligence: 0, loyalty: 0, },);
    const calm = makeNPCDecision(p, 100, 100, 1, 1, [],);
    expect(calm.type,).toBe("defend",);
    const scarred = makeNPCDecision(
      p,
      100,
      100,
      1,
      1,
      [defeat("b1", 100,), defeat("b2", 100,), defeat("b3", 100,),],
    );
    expect(scarred.type,).toBe("attack",);
  });

  test("only the last three defeats count toward the memory modifier", () => {
    const p = personality({ aggression: 50, courage: 50, caution: 80, intelligence: 0, loyalty: 0, },);
    const withOld = makeNPCDecision(
      p,
      100,
      100,
      1,
      1,
      [defeat("b0", 1000,), defeat("b1", 0,), defeat("b2", 0,), defeat("b3", 0,),],
    );
    // Oldest 1000-impact defeat falls outside the last-3 window, so defend still wins
    expect(withOld.type,).toBe("defend",);
  });

  test("low health doubles flee weight and halves attack weight", () => {
    const p = personality({ aggression: 60, courage: 50, caution: 10, intelligence: 0, loyalty: 0, },);
    const healthy = makeNPCDecision(p, 100, 100, 1, 3, [],);
    expect(healthy.type,).toBe("attack",);
    const dying = makeNPCDecision(p, 10, 100, 1, 3, [],);
    expect(dying.type,).toBe("flee",);
  });

  test("wounded cautious NPC defends with wounded reasoning", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 0, courage: 100, caution: 50, intelligence: 0, loyalty: 0, },),
      30,
      100,
      1,
      5,
      [],
    );
    expect(decision.type,).toBe("defend",);
    expect(decision.reasoning,).toBe("Wounded, needs to protect self",);
  });

  test("outnumbered moderate flees for tactical reasons", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 0, courage: 50, caution: 0, intelligence: 0, loyalty: 0, },),
      100,
      100,
      4,
      1,
      [],
    );
    expect(decision.type,).toBe("flee",);
    expect(decision.reasoning,).toBe("Outnumbered, tactical retreat",);
  });

  test("high courage without aggression attacks boldly", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 50, courage: 90, caution: 0, intelligence: 0, loyalty: 0, },),
      100,
      100,
      1,
      1,
      [],
    );
    expect(decision.type,).toBe("attack",);
    expect(decision.reasoning,).toBe("High courage emboldens attack",);
  });

  test("confidence is clamped to 0-100 and consistent with weights", () => {
    const decision = makeNPCDecision(
      personality({ aggression: 80, courage: 80, caution: 20, intelligence: 10, loyalty: 10, },),
      100,
      100,
      1,
      1,
      [],
    );
    expect(decision.confidence,).toBeGreaterThanOrEqual(0,);
    expect(decision.confidence,).toBeLessThanOrEqual(100,);
    expect(Number.isInteger(decision.confidence,),).toBe(true,);
  });
});
