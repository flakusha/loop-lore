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

// ── NSFW Intimacy Levels ─────────────────────────────────
export const IntimacyLevel = {
  Strangers: 0,
  Acquaintances: 10,
  Friends: 25,
  CloseFriends: 40,
  RomanticInterest: 55,
  Dating: 70,
  Intimate: 85,
  Soulbonded: 100,
} as const;
export type IntimacyLevel = (typeof IntimacyLevel)[keyof typeof IntimacyLevel];

// ── NSFW Intimacy Action Types ───────────────────────────
export const IntimacyActionType = {
  Verbal: "verbal",
  Physical: "physical",
  Gift: "gift",
  Service: "service",
  Intimate: "intimate",
} as const;
export type IntimacyActionType = (typeof IntimacyActionType)[keyof typeof IntimacyActionType];

// ── NSFW Arousal Levels ──────────────────────────────────
export const ArousalLevel = {
  Calm: "calm",
  MildlyAroused: "mildly_aroused",
  Aroused: "aroused",
  HighlyAroused: "highly_aroused",
  Desperate: "desperate",
  Climax: "climax",
} as const;
export type ArousalLevel = (typeof ArousalLevel)[keyof typeof ArousalLevel];

// ── NSFW Encounter Types ─────────────────────────────────
export const NsfwEncounterType = {
  Romantic: "romantic",
  Passionate: "passionate",
  Experimental: "experimental",
  Dominant: "dominant",
  Submissive: "submissive",
  Public: "public",
  Voyeuristic: "voyeuristic",
  Group: "group",
  Roleplay: "roleplay",
  Rough: "rough",
  Tender: "tender",
} as const;
export type NsfwEncounterType = (typeof NsfwEncounterType)[keyof typeof NsfwEncounterType];

// ── NSFW Content Intensity ───────────────────────────────
export const ContentIntensity = {
  Vanilla: "vanilla",
  Mild: "mild",
  Moderate: "moderate",
  Intense: "intense",
  Extreme: "extreme",
} as const;
export type ContentIntensity = (typeof ContentIntensity)[keyof typeof ContentIntensity];

// ── NSFW Narrative Style ─────────────────────────────────
export const NarrativeStyle = {
  FadeToBlack: "fade_to_black",
  Implied: "implied",
  Explicit: "explicit",
  Literary: "literary",
} as const;
export type NarrativeStyle = (typeof NarrativeStyle)[keyof typeof NarrativeStyle];

// ── NSFW Seduction Skill Categories ──────────────────────
export const SeductionSkillCategory = {
  Foreplay: "foreplay",
  Oral: "oral",
  Penetrative: "penetrative",
  Manual: "manual",
  Massage: "massage",
  Striptease: "striptease",
  DirtyTalk: "dirty_talk",
  Roleplay: "roleplay",
  Dominance: "dominance",
  Submission: "submission",
  Aftercare: "aftercare",
  Communication: "communication",
} as const;
export type SeductionSkillCategory = (typeof SeductionSkillCategory)[keyof typeof SeductionSkillCategory];

// ── NSFW Fantasy Categories ──────────────────────────────
export const FantasyCategory = {
  PowerExchange: "power_exchange",
  Exhibitionism: "exhibitionism",
  Voyeurism: "voyeurism",
  Roleplay: "roleplay",
  Sensation: "sensation",
  Group: "group",
  Taboo: "taboo",
  Transformation: "transformation",
  Worship: "worship",
  PetPlay: "pet_play",
  Breeding: "breeding",
  PainPlay: "pain_play",
  Bondage: "bondage",
  Service: "service",
  Degradation: "degradation",
  Praise: "praise",
} as const;
export type FantasyCategory = (typeof FantasyCategory)[keyof typeof FantasyCategory];

// ── NSFW Body Build ──────────────────────────────────────
export const BodyBuild = {
  Slim: "slim",
  Athletic: "athletic",
  Average: "average",
  Curvy: "curvy",
  Muscular: "muscular",
  Heavy: "heavy",
} as const;
export type BodyBuild = (typeof BodyBuild)[keyof typeof BodyBuild];

// ── NSFW Size Category ───────────────────────────────────
export const SizeCategory = {
  Petite: "petite",
  Small: "small",
  Average: "average",
  Large: "large",
  Massive: "massive",
} as const;
export type SizeCategory = (typeof SizeCategory)[keyof typeof SizeCategory];

// ── NSFW Heat Phase ──────────────────────────────────────
export const HeatPhase = {
  Normal: "normal",
  PreHeat: "pre_heat",
  Heat: "heat",
  PostHeat: "post_heat",
} as const;
export type HeatPhase = (typeof HeatPhase)[keyof typeof HeatPhase];

// ── NSFW Location Type ───────────────────────────────────
export const NsfwLocationType = {
  Bedroom: "bedroom",
  Bathroom: "bathroom",
  Kitchen: "kitchen",
  LivingRoom: "living_room",
  Dungeon: "dungeon",
  Tavern: "tavern",
  Alley: "alley",
  Forest: "forest",
  Beach: "beach",
  HotSpring: "hot_spring",
  Carriage: "carriage",
  Garden: "garden",
  Balcony: "balcony",
  Library: "library",
  Office: "office",
  Workshop: "workshop",
} as const;
export type NsfwLocationType = (typeof NsfwLocationType)[keyof typeof NsfwLocationType];
