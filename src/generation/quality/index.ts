// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Generation quality metrics (FEAT-062). */
export { aggregateQuality, } from "./aggregate";
export type {
  QualityFinishReason,
  QualityGroupRow,
  QualityModelStats,
  QualityReport,
  QualityTotals,
  QualityTrendPoint,
} from "./aggregate";
export { buildQualityMetadata, QUALITY_METADATA_KEY, qualityMetricsJson, } from "./metadata";
export type { QualityMetrics, } from "./metadata";
export type { RepetitionStats, } from "./repetition-rate";
export { repetitionRate, repetitionStats, tokenize, trigramCounts, } from "./repetition-rate";
