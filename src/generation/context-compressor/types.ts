// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ContextMessage, ContextWindowConfig, SummarizeFn, TokenCountFn, } from "../context-window-config";

// ── Public compression types ───────────────────────────────

/** */
export interface CompressionMetadata {
  originalTokens: number;
  compressedTokens: number;
  originalCount: number;
  compressedCount: number;
  systemCount: number;
  conversationDropped: number;
  conversationKept: number;
  budgetExceeded: boolean;
}

/** */
export interface CompressionResult {
  compressed: ContextMessage[];
  metadata: CompressionMetadata;
}

/**
 * Main entry point. Compress messages to fit within token budget.
 * No-op when messages already fit.
 * @param messages — Ordered message array (system first, then conversation)
 * @param config — Context window configuration (defaults used when omitted)
 * @param tokenCountFn — Token counting function (default: ~4 chars/token)
 * @param summarizeFn — Optional LLM summarization callback
 */
export interface CompressMessagesOpts {
  messages: ContextMessage[];
  config?: ContextWindowConfig;
  tokenCountFn?: TokenCountFn;
  summarizeFn?: SummarizeFn;
}

// ── Internal shared shapes ─────────────────────────────────

/** Separate leading system messages from conversation messages */
export interface SplitMessages {
  system: ContextMessage[];
  conversation: ContextMessage[];
}

/** */
export interface StrategyResult {
  compressedSystem: ContextMessage[];
  compressedConversation: ContextMessage[];
}
