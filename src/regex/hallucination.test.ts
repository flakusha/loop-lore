import { describe, expect, test, } from "bun:test";
import {
  ITEM_INDICATORS,
  LOCATION_INDICATORS,
  WORLD_INDICATORS,
} from "./hallucination";

// ── Location Indicators ───────────────────────────────────

describe("LOCATION_INDICATORS", () => {
  const cases = [
    "at the tavern",
    "in the forest",
    "near the castle",
    "toward the mountain",
    "from the village",
    "arrived at the inn",
    "entered the dungeon",
    "left the room",
    "visited the shrine",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(LOCATION_INDICATORS.test(input,),).toBe(true,);
    });
  }

  test("case insensitive", () => {
    expect(LOCATION_INDICATORS.test("AT the tavern",),).toBe(true,);
  });

  test("does not match unrelated text", () => {
    expect(LOCATION_INDICATORS.test("The dragon flew overhead",),).toBe(false,);
  });
});

// ── Item Indicators ───────────────────────────────────────

describe("ITEM_INDICATORS", () => {
  const cases = [
    "picked up the sword",
    "found a potion",
    "equipped the shield",
    "used the key",
    "wielded the axe",
    "wearing the armor",
    "carrying the bag",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(ITEM_INDICATORS.test(input,),).toBe(true,);
    });
  }

  test("case insensitive", () => {
    expect(ITEM_INDICATORS.test("PICKED UP the sword",),).toBe(true,);
  });

  test("does not match unrelated text", () => {
    expect(ITEM_INDICATORS.test("The character walked forward",),).toBe(false,);
  });
});

// ── World Indicators ──────────────────────────────────────

describe("WORLD_INDICATORS", () => {
  const cases = [
    "the world is vast",
    "the realm of magic",
    "the kingdom of Eldoria",
    "the land of shadows",
    "another dimension",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(WORLD_INDICATORS.test(input,),).toBe(true,);
    });
  }

  test("case insensitive", () => {
    expect(WORLD_INDICATORS.test("The WORLD is vast",),).toBe(true,);
  });

  test("does not match unrelated text", () => {
    expect(WORLD_INDICATORS.test("The character fought bravely",),).toBe(false,);
  });
});
