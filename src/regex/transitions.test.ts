import { describe, expect, test, } from "bun:test";
import {
  CONTEXT_CUT,
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TEMPORAL_TRANSITION,
  TRANSITION_PHRASES,
} from "./transitions";

// ── Movement ──────────────────────────────────────────────

describe("MOVEMENT_VERBS", () => {
  const cases = [
    "I walk to the tavern",
    "We move to the forest",
    "You go to the castle",
    "I travel to the city",
    "We head to the inn",
    "I enter the dungeon",
    "We leave the room",
    "You exit the building",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(MOVEMENT_VERBS.test(input,),).toBe(true,);
    });
  }

  test("case insensitive", () => {
    expect(MOVEMENT_VERBS.test("I WALK to the tavern",),).toBe(true,);
  });

  test("does not match unrelated text", () => {
    expect(MOVEMENT_VERBS.test("The dragon flies overhead",),).toBe(false,);
  });
});

// ── Scene Change ──────────────────────────────────────────

describe("SCENE_CHANGE", () => {
  const cases = [
    "The scene shifts to the forest",
    "Scene changes to nighttime",
    "The setting moves to the castle",
    "Location transitions to the tavern",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(SCENE_CHANGE.test(input,),).toBe(true,);
    });
  }

  test("does not match unrelated text", () => {
    expect(SCENE_CHANGE.test("The character moves quietly",),).toBe(false,);
  });
});

// ── Transition Phrases ────────────────────────────────────

describe("TRANSITION_PHRASES", () => {
  const cases = [
    "Let's go to the tavern",
    "Let's go to the castle",
    "heading to the forest",
    "arriving at the inn",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(TRANSITION_PHRASES.test(input,),).toBe(true,);
    });
  }

  test("does not match unrelated text", () => {
    expect(TRANSITION_PHRASES.test("I found a sword",),).toBe(false,);
  });
});

// ── Temporal Transition ───────────────────────────────────

describe("TEMPORAL_TRANSITION", () => {
  const cases = [
    "After a while, the sun set",
    "After a moment of silence",
    "After a few minutes of walking",
    "After a long journey through the mountains",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(TEMPORAL_TRANSITION.test(input,),).toBe(true,);
    });
  }

  test("does not match unrelated text", () => {
    expect(TEMPORAL_TRANSITION.test("After the battle, we rested",),).toBe(false,);
  });
});

// ── Context Cut ───────────────────────────────────────────

describe("CONTEXT_CUT", () => {
  const cases = [
    "Context cut to the next morning",
    "Skip ahead to the feast",
    "Skip forward three days",
    "Skip time to evening",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(CONTEXT_CUT.test(input,),).toBe(true,);
    });
  }

  test("case insensitive", () => {
    expect(CONTEXT_CUT.test("CONTEXT CUT to the next scene",),).toBe(true,);
  });

  test("does not match unrelated text", () => {
    expect(CONTEXT_CUT.test("I skip rope in the yard",),).toBe(false,);
  });
});
