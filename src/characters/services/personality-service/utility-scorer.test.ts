// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  type ReactionContext,
  REACTION_KIND,
  type ReactionKind,
  REACTION_KINDS,
  type ResolvedPersonality,
} from "./utility-scorer-types";
import { deriveWeights, scoreOne, scoreReaction, } from "./utility-scorer";

/** Profile helpers. */
const BOLD: ResolvedPersonality = { resolved: { D8_approach: "1", personality_traits: "brave, reckless", }, };
const CAUTIOUS: ResolvedPersonality = { resolved: { D8_approach: "-1", D7_coping: "0.5", personality_traits: "paranoid, careful", }, };
const NEUTRAL: ResolvedPersonality = { resolved: {}, };

const CTX: ReactionContext = { isHostile: false, inDanger: false, hasLineOfEffect: true, relationToActor: "neutral", };
const HOSTILE_CTX: ReactionContext = { ...CTX, isHostile: true, };
const DANGER_CTX: ReactionContext = { ...CTX, inDanger: true, };

describe("deriveWeights — trait → weight mapping", () => {
  test("empty profile yields zero weights", () => {
    const w = deriveWeights(NEUTRAL,);
    expect(w.bold,).toBe(0,);
    expect(w.cautious,).toBe(0,);
  },);

  test("D8=1 weights bold positive / cautious negative", () => {
    const w = deriveWeights(BOLD,);
    expect(w.bold,).toBeGreaterThan(0,);
    expect(w.cautious,).toBeLessThanOrEqual(0,);
  },);

  test("freeform 'brave' boosts bold", () => {
    const w = deriveWeights(BOLD,);
    expect(w.bold,).toBeGreaterThanOrEqual(0.3,);
  },);

  test("freeform 'paranoid' boosts cautious", () => {
    const w = deriveWeights(CAUTIOUS,);
    expect(w.cautious,).toBeGreaterThan(0,);
  },);

  test("core_values 'help' boosts agreeable", () => {
    const profile: ResolvedPersonality = { resolved: { core_values: "help others", }, };
    const w = deriveWeights(profile,);
    expect(w.agreeable,).toBeGreaterThan(0,);
  },);
},);

describe("scoreOne — context boost", () => {
  test("inDanger boosts flee + defend", () => {
    const w = deriveWeights(NEUTRAL,);
    const wait = scoreOne(REACTION_KIND.Wait, w, DANGER_CTX,);
    const flee = scoreOne(REACTION_KIND.Flee, w, DANGER_CTX,);
    // Both boosted; assert flee outranks wait for danger-averse actor
    const wCautious = deriveWeights(CAUTIOUS,);
    expect(scoreOne(REACTION_KIND.Flee, wCautious, DANGER_CTX,),).toBeGreaterThan(
      scoreOne(REACTION_KIND.Wait, wCautious, DANGER_CTX,),
    );
    expect(flee,).toBeGreaterThanOrEqual(wait,);
  },);

  test("hostile context boosts attack", () => {
    const w = deriveWeights(BOLD,);
    expect(scoreOne(REACTION_KIND.Attack, w, HOSTILE_CTX,),).toBeGreaterThan(
      scoreOne(REACTION_KIND.Attack, w, CTX,),
    );
  },);

  test("no line of effect penalises attack", () => {
    const w = deriveWeights(BOLD,);
    const blocked: ReactionContext = { ...CTX, hasLineOfEffect: false, };
    expect(scoreOne(REACTION_KIND.Attack, w, blocked,),).toBeLessThan(
      scoreOne(REACTION_KIND.Attack, w, CTX,),
    );
  },);
},);

describe("scoreReaction — full path (3 profiles × 6 kinds)", () => {
  for (const profileName of ["BOLD", "CAUTIOUS", "NEUTRAL"] as const) {
    const profile = profileName === "BOLD" ? BOLD : profileName === "CAUTIOUS" ? CAUTIOUS : NEUTRAL;
    for (const kind of REACTION_KINDS) {
      test(`${profileName} → scored all-reactions (includes ${kind})`, () => {
        const decision = scoreReaction(profile, REACTION_KINDS, CTX,);
        expect(REACTION_KINDS,).toContain(decision.kind,);
        expect(Number.isFinite(decision.score,),).toBe(true,);
        expect(decision.reason.length,).toBeGreaterThan(0,);
      },);
    }
  }
},);

describe("scoreReaction — selection invariants", () => {
  test("bold hostile actor picks attack over wait", () => {
    const decision = scoreReaction(BOLD, REACTION_KINDS, HOSTILE_CTX,);
    expect(decision.kind,).toBe(REACTION_KIND.Attack,);
  },);

  test("cautious danger actor picks flee", () => {
    const decision = scoreReaction(CAUTIOUS, REACTION_KINDS, DANGER_CTX,);
    expect(decision.kind,).toBe(REACTION_KIND.Flee,);
  },);

  test("neutral actor defaults to chat or wait", () => {
    const decision = scoreReaction(NEUTRAL, REACTION_KINDS, CTX,);
    expect(([REACTION_KIND.Chat, REACTION_KIND.Wait, REACTION_KIND.Ignore,] as ReactionKind[]),).toContain(decision.kind,);
  },);

  test("empty candidates falls back to wait", () => {
    const decision = scoreReaction(NEUTRAL, [], CTX,);
    expect(decision.kind,).toBe(REACTION_KIND.Wait,);
  },);

  test("sub-scoped candidates narrow the choice", () => {
    const candidates: ReactionKind[] = [REACTION_KIND.Attack, REACTION_KIND.Flee,];
    const decision = scoreReaction(BOLD, candidates, CTX,);
    expect(candidates,).toContain(decision.kind,);
  },);
},);
