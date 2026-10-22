// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * getReasoning tests — pins the score-band × dimension reasoning matrix.
 *
 * Resource contract: pure functions only — no DB, no timers, no globals.
 * Order-independent.
 */
import { describe, expect, test, } from "bun:test";
import { QualityDimension, } from "../../db/enums";
import { getReasoning, } from "./reasoning";

describe("getReasoning", () => {
  test("high band (>= 80) returns per-dimension reasoning", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 80,),).toBe(
      "Strong consistent character voice with natural dialogue",
    );

    expect(getReasoning(QualityDimension.PlotCoherence, 95,),).toBe(
      "Response logically follows from context",
    );

    expect(getReasoning(QualityDimension.LoreConsistency, 100,),).toBe(
      "References known world entities correctly",
    );

    expect(getReasoning(QualityDimension.NarrativeQuality, 81,),).toBe(
      "Well-paced prose with sensory detail",
    );

    expect(getReasoning(QualityDimension.QuestRelevance, 99,),).toBe(
      "Directly addresses active quest objectives",
    );

    expect(getReasoning(QualityDimension.Creativity, 80,),).toBe(
      "Original and evocative narrative choices",
    );
  });

  test("mid band (50–79) returns per-dimension reasoning", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 79,),).toBe(
      "Adequate character voice, minor inconsistencies",
    );

    expect(getReasoning(QualityDimension.PlotCoherence, 50,),).toBe(
      "Generally coherent but some weak connections",
    );

    expect(getReasoning(QualityDimension.LoreConsistency, 60,),).toBe(
      "Mostly consistent with world lore",
    );

    expect(getReasoning(QualityDimension.NarrativeQuality, 55,),).toBe(
      "Functional prose, could use more detail",
    );

    expect(getReasoning(QualityDimension.QuestRelevance, 51,),).toBe(
      "Marginally touches on quest elements",
    );

    expect(getReasoning(QualityDimension.Creativity, 75,),).toBe(
      "Some creative elements but follows expected patterns",
    );
  });

  test("low band (< 50) returns per-dimension reasoning", () => {
    expect(getReasoning(QualityDimension.CharacterVoice, 49,),).toBe(
      "Weak or absent character voice",
    );

    expect(getReasoning(QualityDimension.PlotCoherence, 0,),).toBe(
      "Poor logical connection to prior events",
    );

    expect(getReasoning(QualityDimension.LoreConsistency, 10,),).toBe(
      "Contradicts or ignores world lore",
    );

    expect(getReasoning(QualityDimension.NarrativeQuality, 25,),).toBe(
      "Flat or confusing prose",
    );

    expect(getReasoning(QualityDimension.QuestRelevance, 33,),).toBe(
      "Ignores active quest context",
    );

    expect(getReasoning(QualityDimension.Creativity, 49,),).toBe(
      "Generic or repetitive content",
    );
  });

  test("band boundaries are exact: 80 is high, 79 is mid, 50 is mid, 49 is low", () => {
    const voice = getReasoning(QualityDimension.CharacterVoice, 0,);
    expect(getReasoning(QualityDimension.CharacterVoice, 80,),).not.toBe(voice,);
    expect(getReasoning(QualityDimension.CharacterVoice, 79,),).not.toBe(
      getReasoning(QualityDimension.CharacterVoice, 80,),
    );

    expect(getReasoning(QualityDimension.CharacterVoice, 49,),).not.toBe(
      getReasoning(QualityDimension.CharacterVoice, 50,),
    );
  });
});
