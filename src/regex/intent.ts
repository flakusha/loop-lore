// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant Intent Patterns
 *
 * Compiled regex patterns for routing user messages to the correct
 * handler: generation pipeline, tool execution, API calls, or chat.
 * @module regex/intent
 */

/** Intent categories for routing user requests */
export type AssistantIntent = "generate" | "tool_exec" | "api_call" | "chat";

/**
 * Keyword patterns for intent classification.
 * Each pattern is matched case-insensitively against user input.
 */
export const INTENT_PATTERNS: readonly {
  readonly intent: AssistantIntent;
  readonly target: string;
  readonly confidence: number;
  readonly requires_approval: boolean;
  readonly patterns: readonly RegExp[];
}[] = [
  // Generation intents — require quality + user confirmation
  {
    intent: "generate",
    target: "character",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*character/i, /generate.*character/i, /new character/i, /make.*character/i,],
  },
  {
    intent: "generate",
    target: "item",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*item/i, /generate.*item/i, /new item/i, /make.*item/i, /craft.*item/i,],
  },
  {
    intent: "generate",
    target: "location",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*location/i, /generate.*location/i, /new location/i, /make.*location/i, /world.*location/i,],
  },
  {
    intent: "generate",
    target: "world",
    confidence: 0.9,
    requires_approval: true,
    patterns: [/create.*world/i, /generate.*world/i, /new world/i, /make.*world/i,],
  },
  {
    intent: "generate",
    target: "image",
    confidence: 0.85,
    requires_approval: true,
    patterns: [/generate.*image/i, /create.*image/i, /draw.*for me/i, /make.*picture/i, /\/image/i,],
  },
  {
    intent: "generate",
    target: "quest",
    confidence: 0.85,
    requires_approval: true,
    patterns: [/create.*quest/i, /generate.*quest/i, /new quest/i, /make.*quest/i, /\/quest/i,],
  },
  // Tool execution intents — pre-approved allowlist
  {
    intent: "tool_exec",
    target: "roll",
    confidence: 0.95,
    requires_approval: false,
    patterns: [/roll.*dice/i, /\/roll/i, /\/dice/i, /\d+d\d+/i,],
  },
  {
    intent: "tool_exec",
    target: "summarize",
    confidence: 0.9,
    requires_approval: false,
    patterns: [/summarize/i, /\/summarize/i, /\/sum\b/i, /summary/i,],
  },
  {
    intent: "tool_exec",
    target: "improve",
    confidence: 0.9,
    requires_approval: false,
    patterns: [/improve/i, /\/improve/i, /rewrite/i, /better.*text/i,],
  },
  // External API call intents — per-call policy
  {
    intent: "api_call",
    target: "search",
    confidence: 0.7,
    requires_approval: true,
    patterns: [/search.*web/i, /look up/i, /find.*info/i, /research/i,],
  },
] as const;

// ── Slash Command Pattern ─────────────────────────────────

/** Match slash commands like /roll, /summarize */
export const SLASH_COMMAND = /^\/(\w+)/;

// ── Keyword Escaping ──────────────────────────────────────

/** Characters that need escaping in keyword-to-regex conversion */
export const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;
