/**
 * DB Schema Enums — Character Domain
 *
 * Content rating, licensing, traits, mood, relationships,
 * avatars, and emotions.
 */

// ── Content Rating ────────────────────────────────────────
export const ContentRating = {
  Sfw: "sfw",
  NsfwMild: "nsfw_mild",
  NsfwModerate: "nsfw_moderate",
  NsfwIntense: "nsfw_intense",
  NsfwExtreme: "nsfw_extreme",
} as const;
export type ContentRating = (typeof ContentRating)[keyof typeof ContentRating];

// ── Licensing ─────────────────────────────────────────────
export const LicenseType = {
  Cc0: "cc0",
  CcBy: "cc_by",
  CcBySa: "cc_by_sa",
  CcByNc: "cc_by_nc",
  CcByNcSa: "cc_by_nc_sa",
  Proprietary: "proprietary",
  Custom: "custom",
} as const;
export type LicenseType = (typeof LicenseType)[keyof typeof LicenseType];

// ── Character Visibility Override (admin) ──────────────────
export const VisibilityOverride = {
  None: "none",
  Private: "private",
  Unlisted: "unlisted",
  Public: "public",
} as const;
export type VisibilityOverride = (typeof VisibilityOverride)[keyof typeof VisibilityOverride];

// ── Trait Categories ──────────────────────────────────────
export const TraitCategory = {
  Identity: "identity",
  Personality: "personality",
  Physical: "physical",
  Social: "social",
  Preferences: "preferences",
  Background: "background",
} as const;
export type TraitCategory = (typeof TraitCategory)[keyof typeof TraitCategory];

// ── World Trait Categories ────────────────────────────────
export const WorldTraitCategory = {
  Environmental: "environmental",
  Cultural: "cultural",
  Magical: "magical",
  Social: "social",
  Equipment: "equipment",
} as const;
export type WorldTraitCategory = (typeof WorldTraitCategory)[keyof typeof WorldTraitCategory];

// ── Relationship Types ────────────────────────────────────
export const RelationshipType = {
  Friend: "friend",
  Rival: "rival",
  Ally: "ally",
  Enemy: "enemy",
  Family: "family",
  Mentor: "mentor",
  Student: "student",
  Neutral: "neutral",
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

// ── Relationship Events ───────────────────────────────────
export const RelationshipEventType = {
  Met: "met",
  Helped: "helped",
  Betrayed: "betrayed",
  Fought: "fought",
  Traded: "traded",
  Trained: "trained",
  Saved: "saved",
  Abandoned: "abandoned",
  Gifted: "gifted",
  insulted: "insulted",
  Praised: "praised",
  Teamed: "teamed",
  Separated: "separated",
  Reconciled: "reconciled",
  Promised: "promised",
} as const;
export type RelationshipEventType = (typeof RelationshipEventType)[keyof typeof RelationshipEventType];

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
