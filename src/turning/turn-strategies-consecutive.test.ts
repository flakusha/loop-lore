// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consecutive-turn guard tests (BUG-group-cascade-consecutive-turn-guard).
 *
 * Each strategy MUST skip the `lastActorId` when at least one alternative
 * candidate exists. Single-participant chats MUST still pick that actor
 * (no alternatives to fall back to).
 */
import { describe, expect, test, } from "bun:test";
import {
  hybridSelect,
  initiativeSelect,
  questDrivenSelect,
  roundRobinSelect,
  sceneBasedSelect,
} from "./turn-strategies";
import type { TurnParticipant, } from "./types";

const baseParticipants: TurnParticipant[] = [
  { actorId: "a", type: "character", agentType: "ai", talkativity: 5, },
  { actorId: "b", type: "character", agentType: "ai", talkativity: 5, },
  { actorId: "c", type: "character", agentType: "ai", talkativity: 5, },
];

const twoParticipants: TurnParticipant[] = baseParticipants.slice(0, 2,);
const singleParticipant: TurnParticipant[] = baseParticipants.slice(0, 1,);

describe("consecutive-turn guard (BUG-group-cascade-consecutive-turn-guard)", () => {
  test("roundRobinSelect: 3 participants, last speaker is `a`, picks non-last actor", () => {
    // Deterministic with turnOrder = ["a", "b", "c"] and currentActorId = null.
    const picked = roundRobinSelect(baseParticipants, null, 0, ["a", "b", "c",], undefined, "a",);
    expect(picked,).not.toBe("a",);
    expect(["b", "c",],).toContain(picked,);
  });

  test("roundRobinSelect: 2 participants, last is `a`, picks the other", () => {
    const picked = roundRobinSelect(twoParticipants, null, 0, ["a", "b",], undefined, "a",);
    expect(picked,).toBe("b",);
  });

  test("roundRobinSelect: single participant MUST pick that actor (no alternative)", () => {
    const picked = roundRobinSelect(singleParticipant, null, 0, ["a",], undefined, "a",);
    expect(picked,).toBe("a",);
  });

  test("roundRobinSelect: when lastActorId is null, picks normally", () => {
    const picked = roundRobinSelect(baseParticipants, null, 0, ["a", "b", "c",],);
    expect(["a", "b", "c",],).toContain(picked,);
  });

  test("sceneBasedSelect: narrator override skipped when narrator is last speaker", () => {
    const withNarrator: TurnParticipant[] = [
      ...baseParticipants,
      { actorId: "n", type: "character", agentType: "narrator", talkativity: 1, },
    ];
    // currentTurn=3 → would normally pick narrator, but narrator == lastActorId.
    const picked = sceneBasedSelect(withNarrator, null, 3, ["a", "b", "c",], undefined, "n",);
    expect(picked,).not.toBe("n",);
  });

  test("initiativeSelect: 2 participants with equal weight, last speaker skipped", () => {
    // Run 20 trials to make sure the skip holds across RNG rolls.
    for (let i = 0; i < 20; i++) {
      const picked = initiativeSelect(twoParticipants, null, 0, [], undefined, "a",);
      expect(picked,).toBe("b",);
    }
  });

  test("questDrivenSelect: delegates to roundRobin with skip", () => {
    const picked = questDrivenSelect(twoParticipants, null, 0, ["a", "b",], undefined, "a",);
    expect(picked,).toBe("b",);
  });

  test("hybridSelect (group chat): @mention overridden when mentioned != last", () => {
    const picked = hybridSelect(
      baseParticipants,
      null,
      0,
      ["a", "b", "c",],
      { chatMode: "group", mentionedActorId: "c", },
      "a",
    );
    expect(picked,).toBe("c",);
  });

  test("hybridSelect (group chat): @mention ignored when mentioned == last", () => {
    // 20 trials — must never return "a" (lastActorId).
    for (let i = 0; i < 20; i++) {
      const picked = hybridSelect(
        twoParticipants,
        null,
        0,
        ["a", "b",],
        { chatMode: "group", mentionedActorId: "a", },
        "a",
      );
      expect(picked,).toBe("b",);
    }
  });
});
