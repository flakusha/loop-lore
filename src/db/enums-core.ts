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

export const MessageStatus = {
  Sending: "sending",
  Sent: "sent",
  Confirmed: "confirmed",
  Failed: "failed",
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
