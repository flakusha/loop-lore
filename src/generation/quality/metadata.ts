// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality metric payloads written next to a generated message (FEAT-062).
 *
 * The blob lives under `messages.metadata.quality` because no dedicated
 * column exists for it: `generation_attempts.repetition_score` already means
 * something else (the streaming detector's similarity score) and reusing it
 * would corrupt the cancellation semantics.
 *
 * Latency and throughput are NOT part of this blob: the `messages` table
 * already has dedicated `generation_time_ms` / `tokens_per_second` columns
 * for them, and duplicating them in JSON would let the two disagree.
 */
import { safeJsonStringify, } from "../../utils";

/** Recorded quality signals for a single generation. */
export interface QualityMetrics {
  /** Trigram repetition rate, 0..1 (0 when the text has no trigrams). */
  repetitionRate: number;
  /** Raw provider finish reason: stop, length, error or cancelled. */
  finishReason: string;
}

/** Key under which the quality blob is stored in `messages.metadata`. */
export const QUALITY_METADATA_KEY = "quality";

/**
 * Serialize the quality blob for `json_set` merges.
 * @param metrics - the recorded quality signals
 * @returns JSON text of the blob itself (not wrapped in the quality key)
 */
export function qualityMetricsJson(metrics: QualityMetrics,): string {
  const r = safeJsonStringify(metrics,);
  return r.ok ? r.value : "{}";
}

/**
 * Serialize a full metadata document for a freshly inserted message row.
 * @param metrics - the recorded quality signals
 * @returns JSON text of `{ quality: {...} }`
 */
export function buildQualityMetadata(metrics: QualityMetrics,): string {
  const r = safeJsonStringify({ [QUALITY_METADATA_KEY]: metrics, },);
  return r.ok ? r.value : "{}";
}
