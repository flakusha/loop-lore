/**
 * Unit tests for src/schemas/nsfw-rating.ts — NSFW Content Rating & Enforcement.
 *
 * Covers the 5-tier severity model, effective-limit computation, permissive
 * checks, and the enforcement factory.
 */
import { describe, expect, test, } from "bun:test";
import {
  computeEffectiveRating,
  createRatingEnforcement,
  isRatingAllowed,
  NSFWContentRating,
  NSFW_RATING_HIERARCHY,
  NSFW_RATING_SEVERITY,
} from "./nsfw-rating";

const {
  SFW,
  NSFW_MILD,
  NSFW_MODERATE,
  NSFW_INTENSE,
  NSFW_EXTREME,
} = NSFWContentRating;

describe("NSFW_RATING_SEVERITY / HIERARCHY", () => {
  test("severity is monotonic ascending with hierarchy", () => {
    expect(NSFW_RATING_SEVERITY[SFW]).toBe(0);
    expect(NSFW_RATING_SEVERITY[NSFW_EXTREME]).toBe(4);
    for (let i = 1; i < NSFW_RATING_HIERARCHY.length; i++) {
      const prev = NSFW_RATING_HIERARCHY[i - 1]!;
      const curr = NSFW_RATING_HIERARCHY[i]!;
      expect(NSFW_RATING_SEVERITY[curr],).toBe(NSFW_RATING_SEVERITY[prev] + 1);
    }
  });
});

describe("computeEffectiveRating", () => {
  test("returns most restrictive (lowest severity) rating", () => {
    expect(computeEffectiveRating(NSFW_EXTREME, NSFW_MODERATE,),).toBe(NSFW_MODERATE);
    expect(computeEffectiveRating(NSFW_MILD, SFW, NSFW_INTENSE,),).toBe(SFW);
    expect(computeEffectiveRating(NSFW_EXTREME, NSFW_EXTREME,),).toBe(NSFW_EXTREME);
  });

  test("empty input defaults to SFW", () => {
    expect(computeEffectiveRating(),).toBe(SFW);
  });
});

describe("isRatingAllowed", () => {
  test("content at or below limit is allowed", () => {
    expect(isRatingAllowed(SFW, NSFW_EXTREME,),).toBe(true);
    expect(isRatingAllowed(NSFW_MODERATE, NSFW_MODERATE,),).toBe(true);
    expect(isRatingAllowed(NSFW_INTENSE, NSFW_EXTREME,),).toBe(true);
  });

  test("content above limit is denied", () => {
    expect(isRatingAllowed(NSFW_EXTREME, NSFW_MODERATE,),).toBe(false);
    expect(isRatingAllowed(NSFW_MILD, SFW,),).toBe(false);
  });
});

describe("createRatingEnforcement", () => {
  test("computes effective limit from three sources", () => {
    const enforcement = createRatingEnforcement({
      character_rating: NSFW_EXTREME,
      user_preference: NSFW_MODERATE,
      chat_setting: NSFW_INTENSE,
      enforcement_point: "generation",
    });

    expect(enforcement.effective_limit).toBe(NSFW_MODERATE); // most restrictive
    expect(enforcement.bypass_allowed).toBe(false);
    expect(enforcement.enforced_by).toBe("system");
    expect(enforcement.enforced_at).toBeInstanceOf(Date);
  });

  test("honors bypass + enforced_by + reason", () => {
    const enforcement = createRatingEnforcement({
      character_rating: SFW,
      user_preference: SFW,
      chat_setting: SFW,
      enforcement_point: "render",
      bypass_allowed: true,
      bypass_reason: "admin override",
      enforced_by: "admin-1",
    });

    expect(enforcement.bypass_allowed).toBe(true);
    expect(enforcement.bypass_reason).toBe("admin override");
    expect(enforcement.enforced_by).toBe("admin-1");
  });
});
