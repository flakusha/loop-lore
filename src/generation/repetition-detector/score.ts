// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RepetitionPattern, } from "../types";

export function computeRepetitionScore(patterns: RepetitionPattern[],): number {
  if (patterns.length === 0) { return 0; }

  // Weighted average: higher weight for patterns with more repetitions
  let totalWeight = 0;
  let weightedScore = 0;

  for (const pattern of patterns) {
    const weight = Math.log2(pattern.count,); // Log scale for repetition count
    weightedScore += pattern.similarity * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.min(1, weightedScore / totalWeight,) : 0;
}
