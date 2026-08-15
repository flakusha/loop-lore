/**
 * Integration tests for src/nsfw/social-integration.ts — NSFW × Social
 * reputation model.
 *
 * Covers encounter reputation deltas (success/failure × social context),
 * seduction prerequisites per target tier, and reputation apply/decay
 * lifecycle against the canonical `ReputationScore` contract.
 */
import { describe, expect, test, } from "bun:test";
import {
  applyReputationChange,
  applyReputationDecay,
  calculateEncounterReputationChange,
  checkPrerequisites,
  computeReputationTier,
  createReputationScore,
  getSeductionPrerequisites,
} from "./social-integration";

describe("calculateEncounterReputationChange", () => {
  test("successful private encounter gives base + intimacy bonus", () => {
    const change = calculateEncounterReputationChange(
      "enc-1",
      "char-1",
      true,
      "private",
      6,
    );
    expect(change.reputationChange,).toBe(8,); // 5 + floor(6/2)
    expect(change.reason,).toBe("successful_intimacy",);
    expect(change.socialContext,).toBe("private",);
  });

  test("successful public encounter halves reputation gain", () => {
    const change = calculateEncounterReputationChange(
      "enc-2",
      "char-2",
      true,
      "public",
      6,
    );
    expect(change.reputationChange,).toBe(4,); // floor(8 * 0.5)
    expect(change.reason,).toBe("public_intimacy",);
  });

  test("successful group encounter gets 1.5x bonus", () => {
    const change = calculateEncounterReputationChange(
      "enc-3",
      "char-3",
      true,
      "group",
      4,
    );
    expect(change.reputationChange,).toBe(10,); // floor((5+2) * 1.5)
    expect(change.reason,).toBe("group_intimacy",);
  });

  test("failed private encounter gives -10", () => {
    const change = calculateEncounterReputationChange(
      "enc-4",
      "char-4",
      false,
      "private",
      0,
    );
    expect(change.reputationChange,).toBe(-10,);
    expect(change.reason,).toBe("failed_seduction",);
  });

  test("failed public encounter doubles the penalty", () => {
    const change = calculateEncounterReputationChange(
      "enc-5",
      "char-5",
      false,
      "public",
      0,
    );
    expect(change.reputationChange,).toBe(-20,);
    expect(change.reason,).toBe("public_failed_seduction",);
  });
});

describe("getSeductionPrerequisites", () => {
  test("hostile tier requires intimidation + deception", () => {
    const prereqs = getSeductionPrerequisites("hostile",);
    expect(prereqs,).toContainEqual(
      { skill: "intimidation", minLevel: 70, required: true, },
    );
    expect(prereqs,).toContainEqual(
      { skill: "deception", minLevel: 80, required: true, },
    );
  });

  test("neutral tier requires basic charisma", () => {
    const prereqs = getSeductionPrerequisites("neutral",);
    expect(prereqs,).toContainEqual(
      { skill: "charisma", minLevel: 40, required: true, },
    );
  });

  test("devoted tier has no prerequisites", () => {
    expect(getSeductionPrerequisites("devoted",),).toEqual([],);
  });
});

describe("checkPrerequisites", () => {
  test("returns met when all required skills pass", () => {
    const prereqs = getSeductionPrerequisites("hostile",);
    const result = checkPrerequisites(prereqs, {
      intimidation: 80,
      deception: 90,
      persuasion: 0,
      empathy: 0,
      charisma: 0,
      seduction: 0,
    },);
    expect(result.met,).toBe(true,);
    expect(result.missing,).toEqual([],);
  });

  test("reports missing required skills, ignores optional", () => {
    const prereqs = getSeductionPrerequisites("unfriendly",);
    const result = checkPrerequisites(prereqs, {
      intimidation: 0,
      deception: 0,
      persuasion: 30,
      empathy: 0,
      charisma: 0,
      seduction: 0,
    },);
    expect(result.met,).toBe(false,);
    expect(result.missing,).toEqual([
      { skill: "persuasion", minLevel: 60, required: true, },
    ],);
  });

  test("missing optional skill does not block", () => {
    const prereqs = getSeductionPrerequisites("neutral",);
    const result = checkPrerequisites(prereqs, {
      intimidation: 0,
      deception: 0,
      persuasion: 0,
      empathy: 0,
      charisma: 50,
      seduction: 0, // optional, below min
    },);
    expect(result.met,).toBe(true,);
  });
});

describe("reputation apply + decay lifecycle", () => {
  test("applyReputationChange clamps to [-100, 100] and records modifier", () => {
    const base = createReputationScore("nsfw", 95,);
    const change = calculateEncounterReputationChange(
      "enc-1",
      "actor-1",
      true,
      "group",
      8,
    );
    const updated = applyReputationChange(base, change,);

    expect(updated.value,).toBe(100,); // clamped
    expect(updated.tier,).toBe(computeReputationTier(100,),);
    expect(updated.modifiers,).toHaveLength(1,);
    expect(updated.modifiers[0],).toMatchObject({ reason: "group_intimacy", },);
  });

  test("createReputationScore defaults decay rate 0.1 and clamps initial", () => {
    const score = createReputationScore("social", 250,);
    expect(score.value,).toBe(100,);
    expect(score.decay_rate,).toBeGreaterThanOrEqual(0.09,);
    expect(score.decay_rate,).toBeLessThanOrEqual(0.11,);
    expect(score.modifiers,).toEqual([],);
    expect(score.source,).toBe("social",);
  });

  test("applyReputationDecay moves positive values toward zero", () => {
    const score = createReputationScore("social", 50,);
    const decayed = applyReputationDecay(score, 10,);
    expect(decayed.value,).toBe(49,); // 50 - 0.1*10
    expect(decayed.tier,).toBe(computeReputationTier(49,),);
  });

  test("applyReputationDecay moves negative values toward zero", () => {
    const score = createReputationScore("social", -50,);
    const decayed = applyReputationDecay(score, 10,);
    expect(decayed.value,).toBe(-49,); // -50 + 0.1*10
  });

  test("applyReputationDecay never crosses zero", () => {
    const score = createReputationScore("social", 1,);
    const decayed = applyReputationDecay(score, 100,);
    expect(decayed.value,).toBe(0,);
  });
});
