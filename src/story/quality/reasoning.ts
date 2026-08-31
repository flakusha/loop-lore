// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { QualityDimension, } from "../../db/enums";

/**
 * @param dimension
 * @param score
 */
export function getReasoning(dimension: QualityDimension, score: number,): string {
  if (score >= 80) {
    switch (dimension) {
      case QualityDimension.CharacterVoice:
        return "Strong consistent character voice with natural dialogue";
      case QualityDimension.PlotCoherence:
        return "Response logically follows from context";
      case QualityDimension.LoreConsistency:
        return "References known world entities correctly";
      case QualityDimension.NarrativeQuality:
        return "Well-paced prose with sensory detail";
      case QualityDimension.QuestRelevance:
        return "Directly addresses active quest objectives";
      case QualityDimension.Creativity:
        return "Original and evocative narrative choices";
      default:
        return "Good quality";
    }
  }
  if (score >= 50) {
    switch (dimension) {
      case QualityDimension.CharacterVoice:
        return "Adequate character voice, minor inconsistencies";
      case QualityDimension.PlotCoherence:
        return "Generally coherent but some weak connections";
      case QualityDimension.LoreConsistency:
        return "Mostly consistent with world lore";
      case QualityDimension.NarrativeQuality:
        return "Functional prose, could use more detail";
      case QualityDimension.QuestRelevance:
        return "Marginally touches on quest elements";
      case QualityDimension.Creativity:
        return "Some creative elements but follows expected patterns";
      default:
        return "Acceptable quality";
    }
  }
  switch (dimension) {
    case QualityDimension.CharacterVoice:
      return "Weak or absent character voice";
    case QualityDimension.PlotCoherence:
      return "Poor logical connection to prior events";
    case QualityDimension.LoreConsistency:
      return "Contradicts or ignores world lore";
    case QualityDimension.NarrativeQuality:
      return "Flat or confusing prose";
    case QualityDimension.QuestRelevance:
      return "Ignores active quest context";
    case QualityDimension.Creativity:
      return "Generic or repetitive content";
    default:
      return "Low quality";
  }
}
