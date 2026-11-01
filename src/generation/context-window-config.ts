// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context Window Configuration
 *
 * Standalone types for context compression, token budget
 * enforcement, and LLM-based summarization/extraction callbacks.
 * Only import is the shared token estimator (no generation-module deps).
 */

import { estimateTokens, } from "../chat/token-utils";

// ── Message shape (compatible with GenerationMessage) ───────

/** */
export interface ContextMessage {
  role: "system" | "user" | "assistant" | "character";
  content: string;
  name?: string;
}

// ── Config ──────────────────────────────────────────────────

/** */
export interface ContextWindowConfig {
  /** Context window size in tokens (default: 32000) */
  maxContextTokens: number;
  /** Minimum recent messages to preserve verbatim (default: 8) */
  minRecentMessages: number;
  /** Compression strategy */
  strategy: "sliding" | "summarize" | "truncate";
  /** Threshold to trigger compression (% of maxContextTokens, default: 0.75) */
  compressionThreshold: number;
  /** Minimum turns (user+assistant pairs) to keep after compression (default: 1) */
  minTurnsAfterCompression: number;
}

// ── Callbacks (opt-in, caller wires the LLM) ────────────────

/** Count tokens in a string. Default: character-based estimate (~4 chars/token) */
export type TokenCountFn = (text: string,) => number;

/** LLM-based summarization: caller injects to avoid circular import */
export type SummarizeFn = (messages: string[],) => Promise<string>;

/** LLM-based fact extraction: caller injects to avoid circular import */
export type ExtractFn = (messagePair: {
  user: string;
  assistant: string;
},) => Promise<{ content: string; confidence: number; importance: number; keywords: string[] }[]>;

// ── Defaults ────────────────────────────────────────────────

export const DEFAULT_CONTEXT_WINDOW: ContextWindowConfig = {
  maxContextTokens: 32_000,
  minRecentMessages: 8,
  strategy: "sliding",
  compressionThreshold: 0.75,
  minTurnsAfterCompression: 1,
};

/**
 * Rough token estimate, delegated to the shared heuristic
 * (`src/chat/token-utils.ts` — ~4 characters per token, English-optimized).
 * @param text
 * @returns {number}
 */
export function defaultTokenCount(text: string,): number {
  return estimateTokens(text,);
}
