/**
 * DB Schema Enums — Core Domain
 *
 * Users, chats, actors, participants, messages.
 */

// ── Users ─────────────────────────────────────────────────
export const UserRole = {
  Admin: "admin",
  User: "user",
  Viewer: "viewer",
  Solo: "solo",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  Active: "active",
  Disabled: "disabled",
  Deactivated: "deactivated",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// ── Chats ─────────────────────────────────────────────────
export const ChatType = {
  Direct: "direct",
  Group: "group",
} as const;
export type ChatType = (typeof ChatType)[keyof typeof ChatType];

export const ChatMode = {
  Direct: "direct",
  Group: "group",
  Story: "story",
} as const;
export type ChatMode = (typeof ChatMode)[keyof typeof ChatMode];

export const ChatPurpose = {
  Main: "main",
  Side: "side",
  Notes: "notes",
} as const;
export type ChatPurpose = (typeof ChatPurpose)[keyof typeof ChatPurpose];

export const TurnStrategy = {
  RoundRobin: "round_robin",
  SceneBased: "scene_based",
  Initiative: "initiative",
  QuestDriven: "quest_driven",
  Hybrid: "hybrid",
} as const;
export type TurnStrategy = (typeof TurnStrategy)[keyof typeof TurnStrategy];

// ── Actors ────────────────────────────────────────────────
export const ActorType = {
  User: "user",
  Character: "character",
  Narrator: "narrator",
  System: "system",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const AgentType = {
  None: "none",
  Ai: "ai",
  Narrator: "narrator",
  Npc: "npc",
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

// ── Chat Participants ─────────────────────────────────────
export const ChatParticipantRole = {
  Member: "member",
  Owner: "owner",
  Observer: "observer",
} as const;
export type ChatParticipantRole = (typeof ChatParticipantRole)[keyof typeof ChatParticipantRole];

// ── Notifications ──────────────────────────────────────────
export const NotificationType = {
  Mention: "mention",
  QuestUpdate: "quest_update",
  ItemOffer: "item_offer",
  WorldEvent: "world_event",
  ChatInvite: "chat_invite",
  CharacterUpdate: "character_update",
  GmAction: "gm_action",
  BlogPost: "blog_post",
  BlogComment: "blog_comment",
  System: "system",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// ── Messages ──────────────────────────────────────────────
export const MessageRole = {
  User: "user",
  Assistant: "assistant",
  Character: "character",
  System: "system",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const MessageContentType = {
  Text: "text",
  Action: "action",
  Narration: "narration",
  System: "system",
  Continuation: "continuation",
} as const;
export type MessageContentType = (typeof MessageContentType)[keyof typeof MessageContentType];

export const MessageContentFormat = {
  Markdown: "markdown",
} as const;
export type MessageContentFormat = (typeof MessageContentFormat)[keyof typeof MessageContentFormat];

export const MessageStatus = {
  Sending: "sending",
  Confirmed: "confirmed",
  Failed: "failed",
  Partial: "partial",
  Rejected: "rejected",
  Cancelled: "cancelled",
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const MessageVisibility = {
  Visible: "visible",
  HiddenByUser: "hidden_by_user",
  HiddenByModerator: "hidden_by_moderator",
  AutoHidden: "auto_hidden",
  Redacted: "redacted",
} as const;
export type MessageVisibility = (typeof MessageVisibility)[keyof typeof MessageVisibility];

// ── Actor / Character Visibility ───────────────────────────
export const ActorVisibility = {
  Private: "private",
  Public: "public",
} as const;
export type ActorVisibility = (typeof ActorVisibility)[keyof typeof ActorVisibility];

// ── Boolean Flags (replacing integer 0/1) ───────────────
export const PinnedState = {
  Unpinned: "unpinned",
  Pinned: "pinned",
  Archived: "archived",
} as const;
export type PinnedState = (typeof PinnedState)[keyof typeof PinnedState];

export const DefaultState = {
  NotDefault: "not_default",
  Default: "default",
} as const;
export type DefaultState = (typeof DefaultState)[keyof typeof DefaultState];

export const EquipState = {
  Unequipped: "unequipped",
  Equipped: "equipped",
} as const;
export type EquipState = (typeof EquipState)[keyof typeof EquipState];

export const StackableState = {
  Unique: "unique",
  Stackable: "stackable",
} as const;
export type StackableState = (typeof StackableState)[keyof typeof StackableState];

// ── Actor Keys ────────────────────────────────────────────
export const KeyType = {
  Signing: "signing",
  Encryption: "encryption",
  Symmetric: "symmetric",
  Master: "master",
  Primary: "primary",
} as const;
export type KeyType = (typeof KeyType)[keyof typeof KeyType];

export const KeyStatus = {
  Active: "active",
  Expired: "expired",
  Revoked: "revoked",
} as const;
export type KeyStatus = (typeof KeyStatus)[keyof typeof KeyStatus];

// ── Notes ─────────────────────────────────────────────────
export const NoteCategory = {
  General: "general",
  World: "world",
  Character: "character",
  Story: "story",
  Combat: "combat",
  Session: "session",
} as const;
export type NoteCategory = (typeof NoteCategory)[keyof typeof NoteCategory];

// ── Actor Items ───────────────────────────────────────────
export const ActorItemType = {
  Equipment: "equipment",
  Consumable: "consumable",
  KeyItem: "key_item",
  Artifact: "artifact",
  Misc: "misc",
} as const;
export type ActorItemType = (typeof ActorItemType)[keyof typeof ActorItemType];

// ── Model Roles ───────────────────────────────────────────
export const ModelRole = {
  Main: "main",
  Auxiliary: "auxiliary",
  Captioning: "captioning",
  Moderation: "moderation",
  Auxiliary: "auxiliary",
  Embeddings: "embeddings",
  Summarization: "summarization",
} as const;
export type ModelRole = (typeof ModelRole)[keyof typeof ModelRole];

// ── Encryption Levels ─────────────────────────────────────
export const EncryptionLevel = {
  None: "none",
  Standard: "standard",
  Private: "private",
} as const;
export type EncryptionLevel = (typeof EncryptionLevel)[keyof typeof EncryptionLevel];

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
