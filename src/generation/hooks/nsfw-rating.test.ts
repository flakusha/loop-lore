// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for src/generation/hooks/nsfw-rating.ts — the nsfw hook's
 * level-string → rating resolution and allow check.
 *
 * BUG-nsfw-leveltorating: unknown level strings previously fell through to
 * SFW (fail-open). This suite fixes the contract: unknown → NSFW_EXTREME
 * (fail-closed), known short + enum names unchanged, and `isAllowed`
 * rejects unknown levels under a restrictive policy.
 */
import { describe, expect, test, } from "bun:test";
import { NSFWContentRating, } from "../../schemas";
import { isAllowed, levelToRating, } from "./nsfw-rating";
import type { HookContext, } from "./types";

const {
  NSFW_MILD,
  NSFW_MODERATE,
  NSFW_INTENSE,
  NSFW_EXTREME,
} = NSFWContentRating;

describe("levelToRating", () => {
  test("maps known short names to their ratings", () => {
    expect(levelToRating("extreme",),).toBe(NSFW_EXTREME,);
    expect(levelToRating("intense",),).toBe(NSFW_INTENSE,);
    expect(levelToRating("moderate",),).toBe(NSFW_MODERATE,);
    expect(levelToRating("mild",),).toBe(NSFW_MILD,);
  });

  test("maps known full enum values to their ratings", () => {
    expect(levelToRating("nsfw_extreme",),).toBe(NSFW_EXTREME,);
    expect(levelToRating("nsfw_intense",),).toBe(NSFW_INTENSE,);
    expect(levelToRating("nsfw_moderate",),).toBe(NSFW_MODERATE,);
    expect(levelToRating("nsfw_mild",),).toBe(NSFW_MILD,);
  });

  test("unknown level fails closed to NSFW_EXTREME (was SFW)", () => {
    expect(levelToRating("unknown_level",),).toBe(NSFW_EXTREME,);
    expect(levelToRating("",),).toBe(NSFW_EXTREME,);
    expect(levelToRating("SFW",),).toBe(NSFW_EXTREME,);
  });
});

describe("isAllowed", () => {
  const context = {
    nsfwPolicy: "mild",
  } as unknown as HookContext;

  test("known safe levels are allowed under a mild policy", () => {
    // Explicit SFW levels are… not a levelToRating input; "none"-style clean
    // content short-circuits before isAllowed in the hook ("none" early-return).
    // The mildest *known rating* (mild) is at the policy limit → allowed.
    expect(isAllowed("mild", context,),).toBe(true,);
  });

  test("known explicit levels above policy are blocked", () => {
    expect(isAllowed("extreme", context,),).toBe(false,);
    expect(isAllowed("moderate", context,),).toBe(false,);
  });

  test("unknown level is blocked under a restrictive policy (fail-closed)", () => {
    expect(isAllowed("unknown_level", context,),).toBe(false,);
  });

  test("unknown level is allowed only when policy is already the strictest", () => {
    const extremeContext = { nsfwPolicy: "extreme", } as unknown as HookContext;
    expect(isAllowed("unknown_level", extremeContext,),).toBe(true,);
  });
});
