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
