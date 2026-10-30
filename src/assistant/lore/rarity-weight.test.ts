/**
 * rarity-weight unit tests — epic-lore-knowledge rarity-weighted selection.
 *
 * `passesRarityWeight` draws Math.random; tests stub it like
 * `lore-activation.test.ts` does for `passesActivationChance`.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { LORE_RARITY_WEIGHTS, passesRarityWeight, } from "./rarity-weight";

const originalRandom = Math.random;

afterEach(() => {
  // passesRarityWeight reads Math.random; restore any per-test stub.
  Math.random = originalRandom;
},);

describe("LORE_RARITY_WEIGHTS", () => {
  test("common is weight 1 and the scale descends to artifact", () => {
    expect(LORE_RARITY_WEIGHTS.common,).toBe(1,);
    expect(LORE_RARITY_WEIGHTS.artifact,).toBeLessThan(
      LORE_RARITY_WEIGHTS.legendary,
    );

    for (const weight of Object.values(LORE_RARITY_WEIGHTS,)) {
      expect(weight,).toBeGreaterThan(0,);
      expect(weight,).toBeLessThanOrEqual(1,);
    }
  });
});

describe("passesRarityWeight", () => {
  test("null, undefined, blank, and unknown tiers always pass", () => {
    Math.random = () => 0.999999;
    expect(passesRarityWeight(null,),).toBe(true,);
    expect(passesRarityWeight(undefined,),).toBe(true,);
    expect(passesRarityWeight("",),).toBe(true,);
    expect(passesRarityWeight("mythic-plus",),).toBe(true,);
  });

  test("common always passes without drawing randomness", () => {
    Math.random = () => 0.999999;
    expect(passesRarityWeight("common",),).toBe(true,);
  });

  test("rare tiers are admitted by their tier weight", () => {
    Math.random = () => 0.05;
    expect(passesRarityWeight("artifact",),).toBe(true,);
    Math.random = () => 0.5;
    expect(passesRarityWeight("artifact",),).toBe(false,);
    Math.random = () => 0.6;
    expect(passesRarityWeight("rare",),).toBe(false,);
    Math.random = () => 0.4;
    expect(passesRarityWeight("rare",),).toBe(true,);
  });
});
