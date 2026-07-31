import { describe, expect, test, } from "bun:test";
import {
  EPISODIC_TEMPORAL,
  EPISODIC_ACTION,
  PROCEDURAL_PREFERENCE,
  PROCEDURAL_LEARNING,
  IMPORTANCE_DECISION,
  IMPORTANCE_EMOTION,
  ENTITY_PATTERN,
  KEYWORD_PROPER_NOUN,
  KEYWORD_ACTION_VERBS,
} from "./memory-classification";

// ── Episodic Patterns ─────────────────────────────────────

describe("EPISODIC_TEMPORAL", () => {
  test.each(["then", "after", "before", "during", "while", "suddenly", "finally"])(
    "matches '%s'",
    (word) => { expect(EPISODIC_TEMPORAL.test(`I went ${word} the battle`)).toBe(true); },
  );

  test("does not match 'theater'", () => {
    expect(EPISODIC_TEMPORAL.test("theater")).toBe(false);
  });
});

describe("EPISODIC_ACTION", () => {
  test.each(["visited", "arrived", "left", "entered", "found", "discovered", "defeated"])(
    "matches '%s'",
    (word) => { expect(EPISODIC_ACTION.test(`I ${word} the dragon`)).toBe(true); },
  );

  test("does not match 'defeatedly'", () => {
    expect(EPISODIC_ACTION.test("defeatedly")).toBe(false);
  });
});

// ── Procedural Patterns ───────────────────────────────────

describe("PROCEDURAL_PREFERENCE", () => {
  const cases = [
    "I prefer swords",
    "She always uses a shield",
    "He never drinks potions",
    "They usually fight at range",
    "She tends to sneak",
    "He likes to charge",
    "She hates magic",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(PROCEDURAL_PREFERENCE.test(input)).toBe(true);
    });
  }

  test("does not match 'presence'", () => {
    expect(PROCEDURAL_PREFERENCE.test("presence")).toBe(false);
  });
});

describe("PROCEDURAL_LEARNING", () => {
  const cases = [
    "I learned the pattern",
    "She discovered that fire works",
    "He realized the weakness",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(PROCEDURAL_LEARNING.test(input)).toBe(true);
    });
  }

  test("does not match 'learning'", () => {
    expect(PROCEDURAL_LEARNING.test("learning")).toBe(false);
  });
});

// ── Importance Scoring ────────────────────────────────────

describe("IMPORTANCE_DECISION", () => {
  const cases = [
    "I decided to attack",
    "She chose the sword",
    "He promised to help",
    "They swore an oath",
    "She vowed revenge",
    "He committed to the quest",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(IMPORTANCE_DECISION.test(input)).toBe(true);
    });
  }

  test("case insensitive", () => {
    expect(IMPORTANCE_DECISION.test("I DECIDED to attack")).toBe(true);
  });

  test("does not match 'decidedly'", () => {
    expect(IMPORTANCE_DECISION.test("decidedly")).toBe(false);
  });
});

describe("IMPORTANCE_EMOTION", () => {
  const cases = [
    "She was angry",
    "He felt happy",
    "They were sad",
    "I was afraid",
    "She got excited",
    "He felt love",
    "She showed hate",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      expect(IMPORTANCE_EMOTION.test(input)).toBe(true);
    });
  }

  test("case insensitive", () => {
    expect(IMPORTANCE_EMOTION.test("She was ANGRY")).toBe(true);
  });

  test("does not match 'angered'", () => {
    expect(IMPORTANCE_EMOTION.test("angered")).toBe(false);
  });
});

describe("ENTITY_PATTERN", () => {
  test("matches proper nouns", () => {
    const text = "Aldric met Elara at the castle";
    const matches = text.match(ENTITY_PATTERN);
    expect(matches).toContain("Aldric");
    expect(matches).toContain("Elara");
  });

  test("does not match common nouns", () => {
    const text = "the dragon flew over the mountain";
    const matches = text.match(ENTITY_PATTERN);
    expect(matches).toBeNull();
  });

  test("matches multi-word names", () => {
    const text = "Lord Aldric met Elara";
    const matches = text.match(ENTITY_PATTERN);
    expect(matches).toContain("Lord Aldric");
    expect(matches).toContain("Elara");
  });
});

// ── Keyword Extraction ────────────────────────────────────

describe("KEYWORD_PROPER_NOUN", () => {
  test.each(["Aldric", "Elara", "Dragon"])(
    "matches '%s'",
    (word) => { expect(KEYWORD_PROPER_NOUN.test(word)).toBe(true); },
  );

  test.each(["the", "a", "is", "dragon"])(
    "does not match '%s'",
    (word) => { expect(KEYWORD_PROPER_NOUN.test(word)).toBe(false); },
  );
});

describe("KEYWORD_ACTION_VERBS", () => {
  const cases = [
    "visited the tavern",
    "found a sword",
    "defeated the dragon",
    "created a potion",
    "built a house",
    "learned a spell",
    "discovered a secret",
    "fought bravely",
    "helped the villager",
    "saved the village",
    "killed the beast",
  ];

  for (const input of cases) {
    test(`matches in "${input}"`, () => {
      const matches = input.match(KEYWORD_ACTION_VERBS);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });
  }

  test("case insensitive", () => {
    const matches = "VISITED the tavern".match(KEYWORD_ACTION_VERBS);
    expect(matches).toContain("VISITED");
  });
});
