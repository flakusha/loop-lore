// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for emotion-avatar-service/seed.ts — base/slot seed derivation.
 */
import { describe, expect, test, } from "bun:test";
import { EMOTION_ORDINAL, EmotionType, } from "../../../db/enums";
import { INVALID_SEED_MESSAGE, isValidSeed, MAX_BASE_SEED, randomBaseSeed, slotSeed, } from "./seed";

describe("seed derivation", () => {
  test("a slot seed is the base seed plus the emotion ordinal", () => {
    expect(slotSeed(4242, EmotionType.Happy,),).toBe(4242 + EMOTION_ORDINAL[EmotionType.Happy],);
    expect(slotSeed(4242, EmotionType.Sad,),).toBe(4242 + EMOTION_ORDINAL[EmotionType.Sad],);
  });

  test("the ordinal offsets keep distinct emotions on distinct seeds", () => {
    expect(slotSeed(0, EmotionType.Happy,),).not.toBe(slotSeed(0, EmotionType.Sad,),);
  });

  test("a random base seed stays inside the valid range", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const seed = randomBaseSeed();
      expect(isValidSeed(seed,),).toBe(true,);
    }
  });

  test("the base seed ceiling leaves room for the largest ordinal", () => {
    const largest = Math.max(...Object.values(EMOTION_ORDINAL,),);
    expect(MAX_BASE_SEED + largest,).toBeLessThanOrEqual(2_147_483_647,);
  });

  test("the rejection message names the valid range", () => {
    expect(INVALID_SEED_MESSAGE,).toContain(String(MAX_BASE_SEED,),);
  });

  test("a seed is valid only inside the base-seed range", () => {
    expect(isValidSeed(0,),).toBe(true,);
    expect(isValidSeed(MAX_BASE_SEED,),).toBe(true,);
    expect(isValidSeed(MAX_BASE_SEED + 1,),).toBe(false,);
    expect(isValidSeed(-1,),).toBe(false,);
    expect(isValidSeed(1.5,),).toBe(false,);
    expect(isValidSeed(Number.NaN,),).toBe(false,);
    expect(isValidSeed("4242",),).toBe(false,);
    expect(isValidSeed(undefined,),).toBe(false,);
  });
});
