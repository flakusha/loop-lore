// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality scorer coverage — reasoning matrix for every dimension and band,
 * creativity boosts/penalties/clamps, narrative-quality bands, and
 * lore-consistency edge cases (including the lowercased-entity behavior).
 */
import { describe, expect, test, } from "bun:test";
import { QualityDimension, } from "../../../db/enums.js";
import { getReasoning, } from "../reasoning.js";
import type { ScorerContext, } from "../types.js";
import { scoreCreativity, } from "./creativity.js";
import { scoreLoreConsistency, } from "./lore-consistency.js";
import { scoreNarrativeQuality, } from "./narrative-quality.js";

/**
 * @param partial
 */
function ctx(partial: Partial<ScorerContext>,): ScorerContext {
  return {
    response: "",
    prompt: "",
    actorName: "Wanderer",
    lore: null,
    quests: [],
    recentTurns: [],
    ...partial,
  };
}

describe("getReasoning", () => {
  const dims = [
    QualityDimension.CharacterVoice,
    QualityDimension.PlotCoherence,
    QualityDimension.LoreConsistency,
    QualityDimension.NarrativeQuality,
    QualityDimension.QuestRelevance,
    QualityDimension.Creativity,
  ] as const;

  test("high band returns the per-dimension praise line", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 80,),).toContain("character voice",);
    expect(getReasoning(QualityDimension.PlotCoherence, 95,),).toContain("logically",);
    expect(getReasoning(QualityDimension.LoreConsistency, 100,),).toContain("world entities",);
    expect(getReasoning(QualityDimension.NarrativeQuality, 80,),).toContain("sensory",);
    expect(getReasoning(QualityDimension.QuestRelevance, 80,),).toContain("quest",);
    expect(getReasoning(QualityDimension.Creativity, 80,),).toContain("Original",);
  });

  test("mid band returns the per-dimension adequate line", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 50,),).toContain("minor inconsistencies",);
    expect(getReasoning(QualityDimension.PlotCoherence, 79,),).toContain("weak connections",);
    expect(getReasoning(QualityDimension.LoreConsistency, 50,),).toContain("Mostly consistent",);
    expect(getReasoning(QualityDimension.NarrativeQuality, 50,),).toContain("Functional",);
    expect(getReasoning(QualityDimension.QuestRelevance, 50,),).toContain("Marginally",);
    expect(getReasoning(QualityDimension.Creativity, 50,),).toContain("expected patterns",);
  });

  test("low band returns the per-dimension weak line", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 49,),).toContain("Weak",);
    expect(getReasoning(QualityDimension.PlotCoherence, 0,),).toContain("Poor",);
    expect(getReasoning(QualityDimension.LoreConsistency, 10,),).toContain("Contradicts",);
    expect(getReasoning(QualityDimension.NarrativeQuality, 49,),).toContain("Flat",);
    expect(getReasoning(QualityDimension.QuestRelevance, 49,),).toContain("Ignores",);
    expect(getReasoning(QualityDimension.Creativity, 49,),).toContain("Generic",);
  });

  test("every dimension yields a non-empty line in every band", () => {
    for (const d of dims) {
      for (const score of [0, 49, 50, 79, 80, 100,]) {
        expect(getReasoning(d, score,).length,).toBeGreaterThan(0,);
      }
    }
  });

  test("damaged input — unknown dimension falls back to generic lines", () => {
    const bogus = "psyche" as QualityDimension;
    expect(getReasoning(bogus, 90,),).toBe("Good quality",);
    expect(getReasoning(bogus, 60,),).toBe("Acceptable quality",);
    expect(getReasoning(bogus, 10,),).toBe("Low quality",);
  });
});

describe("scoreCreativity", () => {
  test("plain prose scores near the base", () => {
    expect(scoreCreativity(ctx({ response: "The knight drew his sword.", },),),).toBe(65,);
  });

  test("evocative words raise the score", () => {
    const s = scoreCreativity(
      ctx({ response: "The ancient forgotten shadow whispered a mysterious warning.", },),
    );
    // ancient, forgotten, shadow, whisper, mysterious = +25
    expect(s,).toBe(90,);
  });

  test("clichés drag the score down", () => {
    const s = scoreCreativity(
      ctx({ response: "It was a dark and stormy night and little did they know.", },),
    );
    // 65 - 15 - 15
    expect(s,).toBe(35,);
  });

  test("near-duplicate recent turns penalize repetition", () => {
    const response = `The ancient forgotten shadow whispered a mysterious warning across the
      glimmering hall while the terrifying beast emerged from the unsettling dark.`;
    const s = scoreCreativity(ctx({ response, recentTurns: [{ response, },], },),);
    // boosted then -20 for similarity 1.0
    expect(s,).toBeLessThan(100,);
    expect(s,).toBeGreaterThanOrEqual(10,);
  });

  test("short recent turns are ignored for similarity", () => {
    const response = "The knight drew his sword.";
    const s = scoreCreativity(ctx({ response, recentTurns: [{ response: "Hi.", },], },),);
    expect(s,).toBe(65,);
  });

  test("null recent responses do not crash", () => {
    const s = scoreCreativity(ctx({ response: "x", recentTurns: [{ response: null, },], },),);
    expect(s,).toBeGreaterThanOrEqual(10,);
  });

  test("score clamps at 100 under heavy evocation", () => {
    const s = scoreCreativity(
      ctx({
        response:
          "unexpected surprising peculiar strange mysterious unsettling beautiful terrifying ancient forgotten glimmer shadow whisper fade emerge",
      },),
    );
    expect(s,).toBe(100,);
  });

  test("score never drops below 10", () => {
    const response = `It was a dark and stormy night. Little did they know, the answer was
      inside them all along. It was all a dream in the nick of time. Destiny called.`;
    const s = scoreCreativity(ctx({ response, },),);
    expect(s,).toBeGreaterThanOrEqual(10,);
  });
});

describe("scoreNarrativeQuality", () => {
  test("ideal length with sensory detail and dialogue scores high", () => {
    const words = Array.from({ length: 120, }, (_, i,) => `word${i}`,).join(" ",);
    const s = scoreNarrativeQuality(
      ctx({ response: `${words} The cold smell of rain. "Run!" he said. She was running.`, },),
    );
    expect(s,).toBeGreaterThan(75,);
  });

  test("very short responses are penalized", () => {
    expect(scoreNarrativeQuality(ctx({ response: "Go.", },),),).toBeLessThan(60,);
  });

  test("consistent past tense earns the steadiness bonus", () => {
    const words = Array.from({ length: 60, }, (_, i,) => `word${i}`,).join(" ",);
    const past = `${words} He was walking and she had gone. They said nothing.`;
    const mixed = `${words} He was walking and she is going. They say nothing and do things.`;
    expect(scoreNarrativeQuality(ctx({ response: past, },),),).toBeGreaterThan(
      scoreNarrativeQuality(ctx({ response: mixed, },),),
    );
  });

  test("empty response stays within bounds", () => {
    const s = scoreNarrativeQuality(ctx({ response: "", },),);
    expect(s,).toBeGreaterThanOrEqual(10,);
    expect(s,).toBeLessThanOrEqual(100,);
  });
});

describe("scoreLoreConsistency", () => {
  test("missing lore returns the neutral default", () => {
    expect(scoreLoreConsistency(ctx({ response: "Anything.", lore: null, },),),).toBe(75,);
    expect(scoreLoreConsistency(ctx({ response: "Anything.", lore: "", },),),).toBe(75,);
  });

  test("lowercased input yields no extractable entities, so the base holds", () => {
    expect(
      scoreLoreConsistency(ctx({ response: "Aldoria has fallen.", lore: "Aldoria has fallen.", },),),
    ).toBe(70,);
  });

  test("unrelated lore keeps the base score", () => {
    expect(
      scoreLoreConsistency(ctx({ response: "Soup.", lore: "Dragons.", },),),
    ).toBe(70,);
  });

  test("empty response against lore stays in bounds", () => {
    const s = scoreLoreConsistency(ctx({ response: "", lore: "Some lore here.", },),);
    expect(s,).toBeGreaterThanOrEqual(10,);
    expect(s,).toBeLessThanOrEqual(100,);
  });
});
