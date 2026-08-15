// ── NSFW Access Status ─────────────────────────────────────
// ── State Machine ──────────────────────────────────────────
import { createMachine, type StateDef, } from "../state";

export const NsfwAccessStatus = {
  Clear: "clear",
  Blocked: "blocked",
  Banned: "banned",
} as const;
export type NsfwAccessStatus = (typeof NsfwAccessStatus)[keyof typeof NsfwAccessStatus];

const nsfwAccessStatusDef: StateDef<NsfwAccessStatus> = {
  values: ["clear", "blocked", "banned",] as const,
  initial: "clear",
  transitions: {
    clear: ["blocked", "banned",],
    blocked: ["clear", "banned",],
    banned: ["clear",],
  },
  terminal: [],
};
export const nsfwAccessStatusMachine = createMachine(nsfwAccessStatusDef,);

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
