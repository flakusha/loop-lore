// src/characters/spec/enums.ts — Character specification enums

// ── Content Rating ──────────────────────────────────
export const ContentRating = {
  Sfw: "sfw",
  NsfwMild: "nsfw_mild",
  NsfwModerate: "nsfw_moderate",
  NsfwIntense: "nsfw_intense",
  NsfwExtreme: "nsfw_extreme",
} as const;
export type ContentRating = (typeof ContentRating)[keyof typeof ContentRating];

// ── Validation Mode ─────────────────────────────────
export const ValidationMode = {
  Strict: "strict",
  Relaxed: "relaxed",
} as const;
export type ValidationMode = (typeof ValidationMode)[keyof typeof ValidationMode];

// ── Review State ────────────────────────────────────
export const ReviewState = {
  Draft: "draft",
  PendingReview: "pending_review",
  Approved: "approved",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type ReviewState = (typeof ReviewState)[keyof typeof ReviewState];

// ── Review Role ─────────────────────────────────────
export const ReviewRole = {
  Admin: "admin",
  Moderator: "moderator",
  User: "user",
  LlMain: "llm_main",
  LlAux: "llm_aux",
  LlReview: "llm_review",
} as const;
export type ReviewRole = (typeof ReviewRole)[keyof typeof ReviewRole];

// ── Impersonation Context ───────────────────────────
export const ImpersonationContext = {
  PrivateChat: "private_chat",
  GroupChat: "group_chat",
} as const;
export type ImpersonationContext = (typeof ImpersonationContext)[keyof typeof ImpersonationContext];

// ── Migration Status ────────────────────────────────
export const MigrationStatus = {
  Ready: "migration-ready",
  Partial: "migration-partial",
  Blocked: "migration-blocked",
  Complete: "migration-complete",
} as const;
export type MigrationStatus = (typeof MigrationStatus)[keyof typeof MigrationStatus];

// ── Storage Format ──────────────────────────────────
export const StorageFormat = {
  Json: "json",
  Yaml: "yaml",
  Toml: "toml",
} as const;
export type StorageFormat = (typeof StorageFormat)[keyof typeof StorageFormat];

// ── Import Format ───────────────────────────────────
export const ImportFormat = {
  Ccv2: "ccv2",
  Ccv3: "ccv3",
  CharacterAi: "character-ai",
  JsonFlat: "json-flat",
  Yaml: "yaml",
  Toml: "toml",
  PngV2: "png-v2",
  PngV3: "png-v3",
  Charx: "charx",
} as const;
export type ImportFormat = (typeof ImportFormat)[keyof typeof ImportFormat];

// ── Export Format ───────────────────────────────────
export const ExportFormat = {
  Json: "json",
  Ccv2: "ccv2",
  Ccv3: "ccv3",
  Yaml: "yaml",
  Toml: "toml",
  Png: "png",
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// ── Character Relationship Types ────────────────────
export const CharacterRelationshipType = {
  Friend: "friend",
  Rival: "rival",
  Ally: "ally",
  Enemy: "enemy",
  Family: "family",
  Mentor: "mentor",
  Student: "student",
  Neutral: "neutral",
} as const;
export type CharacterRelationshipType = (typeof CharacterRelationshipType)[keyof typeof CharacterRelationshipType];

// ── World Modifier Types ────────────────────────────
export const WorldModifierType = {
  Speech: "speech",
  Behavior: "behavior",
  Emotional: "emotional",
  Social: "social",
  QuirkSuppression: "quirk_suppression",
} as const;
export type WorldModifierType = (typeof WorldModifierType)[keyof typeof WorldModifierType];
