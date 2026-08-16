// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Messages ──────────────────────────────────────────────
// ── Composite: MessageStatus × MessageVisibility ─────────
// Non-terminal states (sending, partial) must be visible; terminal states
// may carry any visibility. Retry flows through partial (single re-entry).
import { CompositeValidator, createMachine, type StateDef, } from "../state";

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

const messageStatusDef: StateDef<MessageStatus> = {
  values: ["sending", "confirmed", "failed", "partial", "rejected", "cancelled",] as const,
  initial: "sending",
  transitions: {
    sending: ["confirmed", "partial", "failed", "cancelled",],
    partial: ["confirmed", "failed", "rejected", "cancelled",],
    confirmed: [],
    failed: [],
    rejected: [],
    cancelled: [],
  },
  terminal: ["confirmed", "failed", "rejected", "cancelled",],
};

const messageVisibilityDef: StateDef<MessageVisibility> = {
  values: ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted",] as const,
  initial: "visible",
  transitions: {
    visible: ["hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted",],
    hidden_by_user: ["visible",],
    hidden_by_moderator: ["visible", "redacted",],
    auto_hidden: ["visible", "redacted",],
    redacted: [],
  },
  terminal: ["redacted",],
};

export const messageStatusMachine = createMachine(messageStatusDef,);
export const messageVisibilityMachine = createMachine(messageVisibilityDef,);

export const messagesStatusVisibility = new CompositeValidator(
  messageStatusMachine,
  messageVisibilityMachine,
  [
    "sending:visible",
    "partial:visible",
    "confirmed:visible",
    "confirmed:hidden_by_user",
    "confirmed:hidden_by_moderator",
    "confirmed:auto_hidden",
    "confirmed:redacted",
    "failed:visible",
    "failed:hidden_by_moderator",
    "rejected:visible",
    "rejected:redacted",
    "cancelled:visible",
  ] as const,
);
