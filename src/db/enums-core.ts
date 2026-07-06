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

// ── State Machine Definitions ────────────────────────────
import { createMachine, CompositeValidator, type StateDef } from "./state";

export const messageStatusDef: StateDef<MessageStatus> = {
  values: ["sending", "confirmed", "failed", "partial", "rejected", "cancelled"] as const,
  initial: "sending",
  transitions: {
    sending: ["partial", "failed", "cancelled"],
    partial: ["confirmed", "cancelled", "rejected"],
    confirmed: ["partial"],
    failed: ["partial"],
    rejected: ["partial"],
    cancelled: ["partial"],
  },
  terminal: ["confirmed", "failed", "rejected", "cancelled"],
};

export const messageStatusMachine = createMachine(messageStatusDef);

export const messageVisibilityDef: StateDef<MessageVisibility> = {
  values: ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted"] as const,
  initial: "visible",
  transitions: {
    visible: ["hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted"],
    hidden_by_user: ["visible"],
    hidden_by_moderator: ["visible"],
    auto_hidden: ["visible"],
    redacted: [],
  },
  terminal: ["redacted"],
};

export const messageVisibilityMachine = createMachine(messageVisibilityDef);

// Allowed (status:visibility) pairs for message composite state
export const messageCompositeValidator = new CompositeValidator(
  messageStatusMachine,
  messageVisibilityMachine,
  [
    "sending:visible",
    "confirmed:visible",
    "confirmed:hidden_by_user",
    "confirmed:hidden_by_moderator",
    "confirmed:redacted",
    "failed:visible",
    "failed:hidden_by_user",
    "failed:hidden_by_moderator",
    "partial:visible",
    "partial:hidden_by_user",
    "partial:hidden_by_moderator",
    "rejected:auto_hidden",
    "rejected:visible",
    "cancelled:visible",
    "cancelled:hidden_by_user",
    "cancelled:hidden_by_moderator",
  ],
);

export const actorVisibilityDef: StateDef<ActorVisibility> = {
  values: ["private", "public"] as const,
  initial: "private",
  transitions: {
    private: ["public"],
    public: ["private"],
  },
  terminal: [],
};

export const actorVisibilityMachine = createMachine(actorVisibilityDef);
