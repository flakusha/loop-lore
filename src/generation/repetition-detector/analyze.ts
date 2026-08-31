// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RepetitionAnalysis, RepetitionDetectionConfig, } from "../types";
import { detectPatterns, } from "./ngrams";
import { computeRepetitionScore, } from "./score";

/**
 * Analyze a text buffer for repetitive patterns.
 * Returns a scored analysis with detected patterns.
 * @param text
 * @param config
 */
export function analyzeRepetition(text: string, config: RepetitionDetectionConfig,): RepetitionAnalysis {
  if (text.length < config.minChars) {
    return {
      detected: false,
      score: 0,
      patterns: [],
      sampleText: text,
    };
  }

  const patterns = detectPatterns(text, config,);
  const score = computeRepetitionScore(patterns,);

  return {
    detected: score >= config.maxSimilarity,
    score,
    patterns,
    sampleText: text.slice(-config.windowSize,),
  };
}
