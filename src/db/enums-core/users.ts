// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

export const ChatVisibility = {
  Private: "private",
  Public: "public",
  Unlisted: "unlisted",
} as const;
export type ChatVisibility = (typeof ChatVisibility)[keyof typeof ChatVisibility];

export const ThinkingVisibility = {
  /** Thinking block not rendered at all (default — no context spoiling) */
  Hidden: "hidden",
  /** Thinking block rendered inside <details> collapsed */
  Collapsed: "collapsed",
  /** Thinking block rendered expanded (debugging mode) */
  Visible: "visible",
} as const;
export type ThinkingVisibility = (typeof ThinkingVisibility)[keyof typeof ThinkingVisibility];
