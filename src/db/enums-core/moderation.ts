// ── Moderation ──────────────────────────────────────────────
export const ModerationFlagStatus = {
  Pending: "pending",
  UnderReview: "under_review",
  Dismissed: "dismissed",
  Confirmed: "confirmed",
  Escalated: "escalated",
} as const;
export type ModerationFlagStatus = (typeof ModerationFlagStatus)[keyof typeof ModerationFlagStatus];

export const ModerationFlagReason = {
  NsfwViolation: "nsfw_violation",
  Harassment: "harassment",
  HateSpeech: "hate_speech",
  Spam: "spam",
  Underage: "underage",
  NonConsensual: "non_consensual",
  Other: "other",
} as const;
export type ModerationFlagReason = (typeof ModerationFlagReason)[keyof typeof ModerationFlagReason];

export const ModerationAction = {
  None: "none",
  Warned: "warned",
  ContentRemoved: "content_removed",
  NsfwRevoked: "nsfw_revoked",
  Banned: "banned",
} as const;
export type ModerationAction = (typeof ModerationAction)[keyof typeof ModerationAction];
