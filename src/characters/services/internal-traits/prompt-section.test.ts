// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the prompt-section builders exported from
 * `prompt-section.ts` (Goals & Aspirations, Moral Disposition,
 * Approach Tendencies, Voice Patterns).
 *
 * Each builder is a void function that mutates a `lines` array.
 * Visibility is gated by the caller-supplied `isVisible` predicate,
 * so each test exercises both "section hidden" and "section shown"
 * branches, plus the conditional rendering of progress / plans /
 * humor / verbal-tics inside each section.
 */

import { describe, expect, test, } from "bun:test";
import {
  appendApproachTendencies,
  appendAspirations,
  appendMoralDisposition,
  appendVoicePatterns,
} from "./prompt-section";

describe("appendAspirations", () => {
  test("no-op when no aspirations are supplied", () => {
    const lines: string[] = [];
    appendAspirations(lines, [], () => true,);
    expect(lines,).toEqual([],);
  });

  test("no-op when aspirations are non-empty but visibility hides them all", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [{ id: "a1", goal: "secret", priority: "low", visibility: "hidden", progress: 0, plans: [], },],
      () => false,
    );
    expect(lines,).toEqual([],);
  });

  test("renders header, priority, and zero-progress aspirations without progress tag", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [
        { id: "a1", goal: "Find the lost sword", priority: "high", visibility: "open", progress: 0, plans: [], },
      ],
      () => true,
    );
    expect(lines,).toContain("### Goals & Aspirations",);
    expect(lines,).toContain("- [high] Find the lost sword",);
    expect(lines.find((l,) => l.includes("Find the lost sword",)),).not.toContain("progress",);
  });

  test("renders (N% progress) tag only when progress > 0", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [
        { id: "a1", goal: "Save the village", priority: "medium", visibility: "open", progress: 42, plans: [], },
      ],
      () => true,
    );
    expect(lines.some((l,) => l.includes("(42% progress)",)),).toBe(true,);
  });

  test("appends plan bullets joined by '; ' only when plans are present", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [
        {
          id: "a1",
          goal: "Become a master smith",
          priority: "low",
          visibility: "open",
          progress: 0,
          plans: ["apprentice", "buy forge", "study",],
        },
      ],
      () => true,
    );
    const planLine = lines.find((l,) => l.startsWith("  Plans:",));
    expect(planLine,).toBeDefined();
    expect(planLine,).toBe("  Plans: apprentice; buy forge; study",);
  });

  test("includes hidden aspirations when global visibility flag is true", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [{ id: "a1", goal: "private ambition", priority: "low", visibility: "hidden", progress: 0, plans: [], },],
      () => true,
    );
    expect(lines,).toContain("- [low] private ambition",);
  });

  test("renders multiple aspirations in supplied order, trailing blank line", () => {
    const lines: string[] = [];
    appendAspirations(
      lines,
      [
        { id: "a1", goal: "first", priority: "high", visibility: "open", progress: 0, plans: [], },
        { id: "a2", goal: "second", priority: "low", visibility: "open", progress: 10, plans: [], },
      ],
      () => true,
    );
    expect(lines.at(-1,),).toBe("",);
    expect(lines.findIndex((l,) => l.includes("- [high] first",)),).toBeLessThan(
      lines.findIndex((l,) => l.includes("- [low] second",)),
    );
  });
});

describe("appendMoralDisposition", () => {
  test("no-op when visibility hides the section", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: -90, good_evil: -90, }, () => false,);
    expect(lines,).toEqual([],);
  });

  test("renders 'lawful-good' when both axes are strongly negative", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: -90, good_evil: -90, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: lawful-good",);
    expect(lines.at(-1,),).toBe("",);
  });

  test("renders 'chaotic-good' when law is high, good is low", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: 80, good_evil: -80, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: chaotic-good",);
  });

  test("renders 'lawful-evil' when law is low, good is high", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: -80, good_evil: 80, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: lawful-evil",);
  });

  test("renders 'chaotic-evil' when both axes are strongly positive", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: 80, good_evil: 80, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: chaotic-evil",);
  });

  test("renders 'neutral-amoral' when both axes fall within ±30", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: 10, good_evil: -20, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: neutral-amoral",);
  });

  test("boundary value of exactly ±30 still classifies as 'neutral-amoral' (boundary inclusive)", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: 30, good_evil: -30, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: neutral-amoral",);
  });

  test("value just past ±30 boundary classifies as the directional axis", () => {
    const lines: string[] = [];
    appendMoralDisposition(lines, { lawful_chaotic: 31, good_evil: 31, }, () => true,);
    expect(lines,).toContain("### Moral Disposition: chaotic-evil",);
  });
});

describe("appendApproachTendencies", () => {
  test("no-op when visibility hides the section", () => {
    const lines: string[] = [];
    appendApproachTendencies(
      lines,
      { decision_style: "deliberate", risk_tolerance: 50, initiative_level: 50, },
      () => false,
    );
    expect(lines,).toEqual([],);
  });

  test("renders the three numeric scales verbatim in the heading", () => {
    const lines: string[] = [];
    appendApproachTendencies(
      lines,
      { decision_style: "intuitive", risk_tolerance: 75, initiative_level: 30, },
      () => true,
    );
    expect(lines,).toContain(
      "### Approach: intuitive decision-maker, risk tolerance 75/100, initiative 30/100",
    );
    expect(lines.at(-1,),).toBe("",);
  });
});

describe("appendVoicePatterns", () => {
  test("no-op when visibility hides the section", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "formal",
        sentence_structure: "complex",
        humor_style: "none",
        verbal_tics: [],
        emotional_range: 50,
      },
      () => false,
    );
    expect(lines,).toEqual([],);
  });

  test("always renders vocabulary and sentence lines", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "archaic",
        sentence_structure: "flowing",
        humor_style: "none",
        verbal_tics: [],
        emotional_range: 40,
      },
      () => true,
    );
    expect(lines,).toContain("- Vocabulary: archaic",);
    expect(lines,).toContain("- Sentences: flowing",);
  });

  test("omits the humor line when humor_style is 'none'", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "plain",
        sentence_structure: "short",
        humor_style: "none",
        verbal_tics: [],
        emotional_range: 60,
      },
      () => true,
    );
    expect(lines.some((l,) => l.startsWith("- Humor:",)),).toBe(false,);
  });

  test("renders the humor line when humor_style is non-'none'", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "plain",
        sentence_structure: "short",
        humor_style: "dry",
        verbal_tics: [],
        emotional_range: 60,
      },
      () => true,
    );
    expect(lines,).toContain("- Humor: dry",);
  });

  test("omits the tics line when verbal_tics is empty", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "plain",
        sentence_structure: "short",
        humor_style: "none",
        verbal_tics: [],
        emotional_range: 60,
      },
      () => true,
    );
    expect(lines.some((l,) => l.startsWith("- Tics:",)),).toBe(false,);
  });

  test("renders tics joined by ', ' when verbal_tics is non-empty", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "plain",
        sentence_structure: "short",
        humor_style: "none",
        verbal_tics: ["uh", "kinda", "you know",],
        emotional_range: 60,
      },
      () => true,
    );
    expect(lines,).toContain("- Tics: uh, kinda, you know",);
  });

  test("always renders the emotional-range line and trailing blank", () => {
    const lines: string[] = [];
    appendVoicePatterns(
      lines,
      {
        vocabulary_level: "plain",
        sentence_structure: "short",
        humor_style: "none",
        verbal_tics: [],
        emotional_range: 88,
      },
      () => true,
    );
    expect(lines,).toContain("- Emotional range: 88/100",);
    expect(lines.at(-1,),).toBe("",);
  });
});
