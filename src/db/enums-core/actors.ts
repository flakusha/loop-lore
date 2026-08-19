// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
  Guest: "guest",
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

// ── Actor / Character Visibility ───────────────────────────
export const ActorVisibility = {
  Private: "private",
  Public: "public",
} as const;
export type ActorVisibility = (typeof ActorVisibility)[keyof typeof ActorVisibility];
