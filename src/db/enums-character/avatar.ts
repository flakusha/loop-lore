// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Avatar Tag Types ──────────────────────────────────────
export const AvatarTagType = {
  Emotion: "emotion",
  Mood: "mood",
  Action: "action",
  Location: "location",
  Time: "time",
  Outfit: "outfit",
} as const;
export type AvatarTagType = (typeof AvatarTagType)[keyof typeof AvatarTagType];

// ── Avatar Selection Rules ────────────────────────────────
export const AvatarSelectionRule = {
  EmotionFirst: "emotion_first",
  MoodFirst: "mood_first",
  Weighted: "weighted",
  Random: "random",
  Fixed: "fixed",
} as const;
export type AvatarSelectionRule = (typeof AvatarSelectionRule)[keyof typeof AvatarSelectionRule];

// ── Mood Expression Modifiers ─────────────────────────────
export const MoodExpression = {
  Tone: "tone",
  Verbosity: "verbosity",
  Cooperation: "cooperation",
  Warmth: "warmth",
  Humor: "humor",
  Formality: "formality",
} as const;
export type MoodExpression = (typeof MoodExpression)[keyof typeof MoodExpression];

// ── Emotion Types ─────────────────────────────────────────
export const EmotionType = {
  Happy: "happy",
  Sad: "sad",
  Angry: "angry",
  Fearful: "fearful",
  Surprised: "surprised",
  Disgusted: "disgusted",
  Contemptuous: "contemptuous",
  Neutral: "neutral",
  Excited: "excited",
  Anxious: "anxious",
  Calm: "calm",
  Confused: "confused",
  Proud: "proud",
  Shameful: "shameful",
  Loving: "loving",
  Jealous: "jealous",
  Grateful: "grateful",
  Bored: "bored",
} as const;
export type EmotionType = (typeof EmotionType)[keyof typeof EmotionType];

// ── Availability Status ───────────────────────────────────
export const AvailabilityStatus = {
  Available: "available",
  Restricted: "restricted",
  Unavailable: "unavailable",
} as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];

// ── Admin Override Actions ────────────────────────────────
export const AdminOverrideAction = {
  Ban: "ban",
  Approve: "approve",
  Restrict: "restrict",
  Restore: "restore",
} as const;
export type AdminOverrideAction = (typeof AdminOverrideAction)[keyof typeof AdminOverrideAction];
