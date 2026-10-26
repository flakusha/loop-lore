// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emotion-impact handling for episodic memories (TASK-memory-emotion-impact).
 *
 * `actor_memories.emotion_impact` stores a JSON-encoded
 * {@link MemoryEmotionImpact}. This module owns the parse/validate half
 * (writer + reader side) and the injection weighting half (how much an
 * emotional charge lifts a memory's effective importance).
 */

import { safeJsonParse, } from "../utils";
import type { MemoryEmotionImpact, } from "./types";

/** Emotions a memory can carry (TASK-memory-emotion-impact). */
export const EMOTION_IMPACTS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "afraid",
  "disgusted",
  "surprised",
  "grudge",
  "grateful",
  "traumatized",
  "nostalgic",
  "embarrassed",
] as const;

/** Weight applied to the importance score per emotion duration, scaled by intensity. */
const DURATION_WEIGHTS: Record<MemoryEmotionImpact["duration"], number> = {
  momentary: 0.05,
  lasting: 0.15,
  permanent: 0.3,
};

/**
 * Validate an untrusted emotion-impact value (LLM extraction output or a
 * parsed JSON column). Neutral impacts normalize to `undefined` — they
 * carry no signal and keep rows/comparators untouched.
 * @param value Raw value.
 * @returns A validated impact, or `undefined` when the value is not a well-formed non-neutral impact.
 */
export function sanitizeEmotionImpact(value: unknown,): MemoryEmotionImpact | undefined {
  if (typeof value !== "object" || value === null) { return undefined; }
  const raw = value as Record<string, unknown>;

  const emotion = raw.emotion;
  if (typeof emotion !== "string" || !(EMOTION_IMPACTS as readonly string[]).includes(emotion,)) {
    return undefined;
  }

  if (emotion === "neutral") { return undefined; }
  const intensity = raw.intensity;
  if (typeof intensity !== "number" || !Number.isFinite(intensity,) || intensity < 0 || intensity > 100) {
    return undefined;
  }

  const duration = raw.duration;
  if (duration !== "momentary" && duration !== "lasting" && duration !== "permanent") {
    return undefined;
  }

  const impact: MemoryEmotionImpact = {
    emotion: emotion as MemoryEmotionImpact["emotion"],
    intensity,
    duration,
  };

  if (typeof raw.target === "string" && raw.target !== "") {
    impact.target = raw.target;
  }

  if (typeof raw.decay_rate === "number" && Number.isFinite(raw.decay_rate,) && raw.decay_rate >= 0) {
    impact.decayRate = raw.decay_rate;
  }

  if (typeof raw.triggers_coping === "boolean") {
    impact.triggersCoping = raw.triggers_coping;
  }

  return impact;
}

/**
 * Parse the `actor_memories.emotion_impact` JSON column.
 * @param rawColumn Raw column text (JSON-encoded impact) or null.
 * @returns The parsed impact, or `undefined` when absent/malformed.
 */
export function parseEmotionImpact(rawColumn: string | null | undefined,): MemoryEmotionImpact | undefined {
  if (rawColumn === null || rawColumn === undefined || rawColumn === "") { return undefined; }
  const parsed = safeJsonParse<unknown>(rawColumn,);
  if (!parsed.ok) { return undefined; }
  return sanitizeEmotionImpact(parsed.value,);
}

/**
 * Injection weighting: how much an emotion lifts a memory above its stored
 * importance. Sustained emotions (lasting/permanent) and higher intensity
 * weigh more; neutral/absent impacts add nothing.
 * @param impact Parsed impact.
 * @returns Boost in [0, 0.3].
 */
export function emotionBoost(impact: MemoryEmotionImpact | null | undefined,): number {
  if (!impact) { return 0; }
  return DURATION_WEIGHTS[impact.duration] * (impact.intensity / 100);
}

/**
 * Importance score used for injection ordering: stored importance plus the
 * emotion boost, capped at 1. Memories without an impact keep their exact
 * stored importance.
 * @param entry Any { importance, emotionImpact } shape (MemoryEntry or the generic budget item).
 * @returns Effective importance in [0, 1].
 */
export function effectiveImportance(
  entry: { importance: number; emotionImpact?: MemoryEmotionImpact | null },
): number {
  return Math.min(1, entry.importance + emotionBoost(entry.emotionImpact,),);
}
