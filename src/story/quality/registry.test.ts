// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality scorer registry tests — pins the dimension → scorer contract.
 *
 * Resource contract: pure — no DB, no globals. Order-independent.
 */
import { describe, expect, test, } from "bun:test";
import { QualityDimension, } from "../../db/enums";
import { SCORERS, } from "./registry";
import { scoreCharacterVoice, } from "./scorers/character-voice";
import { scoreCreativity, } from "./scorers/creativity";
import { scoreLoreConsistency, } from "./scorers/lore-consistency";
import { scoreNarrativeQuality, } from "./scorers/narrative-quality";
import { scorePlotCoherence, } from "./scorers/plot-coherence";
import { scoreQuestRelevance, } from "./scorers/quest-relevance";
import type { ScorerContext, } from "./types";

function ctx(overrides: Partial<ScorerContext> = {},): ScorerContext {
  return {
    response: "Kara peers into the glimmer of the ancient shrine and speaks.",
    prompt: "explore the shrine",
    actorName: "Kara",
    lore: null,
    quests: [],
    recentTurns: [],
    ...overrides,
  };
}

describe("SCORERS registry", () => {
  test("covers every quality dimension with a function", () => {
    for (const dimension of Object.values(QualityDimension,)) {
      expect(typeof SCORERS[dimension],).toBe("function",);
    }
  });

  test("maps each dimension to its dedicated scorer implementation", () => {
    expect(SCORERS[QualityDimension.CharacterVoice],).toBe(scoreCharacterVoice,);
    expect(SCORERS[QualityDimension.PlotCoherence],).toBe(scorePlotCoherence,);
    expect(SCORERS[QualityDimension.LoreConsistency],).toBe(scoreLoreConsistency,);
    expect(SCORERS[QualityDimension.NarrativeQuality],).toBe(scoreNarrativeQuality,);
    expect(SCORERS[QualityDimension.QuestRelevance],).toBe(scoreQuestRelevance,);
    expect(SCORERS[QualityDimension.Creativity],).toBe(scoreCreativity,);
  });

  test("every registered scorer returns a clamped score in [10, 100] for a sample response", () => {
    const sample = ctx({ response: "", prompt: "", },);
    for (const dimension of Object.values(QualityDimension,)) {
      const score = SCORERS[dimension](sample,);
      expect(score,).toBeGreaterThanOrEqual(10,);
      expect(score,).toBeLessThanOrEqual(100,);
    }
  });
});
