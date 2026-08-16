// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/emotions.ts — Emotion prompt tables + resolvers

import type { EmotionEntry, } from "../../../config/sections/templates";
import { EmotionType, } from "../../../db/enums";

/** Emotion-to-prompt-modifier mapping */
const EMOTION_PROMPT_MODIFIERS: Record<EmotionType, string> = {
  [EmotionType.Happy]: "happy expression, smiling, bright eyes, cheerful",
  [EmotionType.Sad]: "sad expression, downcast eyes, melancholy, sorrowful",
  [EmotionType.Angry]: "angry expression, furrowed brow, intense gaze, furious",
  [EmotionType.Fearful]: "fearful expression, wide eyes, trembling, scared",
  [EmotionType.Surprised]: "surprised expression, raised eyebrows, wide eyes, astonished",
  [EmotionType.Disgusted]: "disgusted expression, wrinkled nose, repulsed",
  [EmotionType.Contemptuous]: "contemptuous expression, sneering, disdainful look",
  [EmotionType.Neutral]: "neutral expression, calm face, natural look",
  [EmotionType.Excited]: "excited expression, enthusiastic, eager, thrilled",
  [EmotionType.Anxious]: "anxious expression, worried brow, nervous, tense",
  [EmotionType.Calm]: "calm expression, serene face, peaceful, composed",
  [EmotionType.Confused]: "confused expression, tilted head, puzzled, bewildered",
  [EmotionType.Proud]: "proud expression, confident, chin up, dignified",
  [EmotionType.Shameful]: "shameful expression, looking away, embarrassed, guilty",
  [EmotionType.Loving]: "loving expression, warm gaze, tender, affectionate",
  [EmotionType.Jealous]: "jealous expression, envious, bitter, resentful",
  [EmotionType.Grateful]: "grateful expression, thankful, appreciative, warm",
  [EmotionType.Bored]: "bored expression, disinterested, vacant stare, apathetic",
};

/** Default emotions to generate if none specified */
export const DEFAULT_EMOTIONS: EmotionType[] = [
  EmotionType.Happy,
  EmotionType.Sad,
  EmotionType.Angry,
  EmotionType.Surprised,
  EmotionType.Fearful,
  EmotionType.Neutral,
  EmotionType.Excited,
  EmotionType.Calm,
];

/** Resolve the modifier for an emotion from the built-in table. */
export function getEmotionPromptModifier(emotion: EmotionType,): string {
  return EMOTION_PROMPT_MODIFIERS[emotion] ?? "neutral expression";
}

/**
 * Resolve the generation prompt modifier for an emotion, preferring the
 * config-driven per-emotion intent description
 * (config.templates.avatar.emotions — keyed by lowercase emotion name) over
 * the built-in EMOTION_PROMPT_MODIFIERS table. This is what consumes the
 * avatar emotion asset map the generation path previously ignored.
 *
 * @param emotion - Emotion type being generated
 * @param avatarEmotions - Optional config emotion map (lowercase keys)
 * @returns Prompt modifier string
 */
export function resolveEmotionPromptModifier(
  emotion: EmotionType,
  avatarEmotions?: Record<string, EmotionEntry>,
): string {
  const intent = avatarEmotions?.[(emotion as string).toLowerCase()]?.intent;
  return intent ?? getEmotionPromptModifier(emotion,);
}
