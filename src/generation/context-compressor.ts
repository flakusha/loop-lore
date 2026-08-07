/**
 * Context Compressor
 *
 * Standalone sliding window + budget enforcement for LLM prompts.
 * Pure functions — no DB imports, no generation module imports.
 * Truncation-only MVP: summarization via SummarizeFn callback.
 */

import type { ContextMessage, ContextWindowConfig, SummarizeFn, TokenCountFn, } from "./context-window-config";
import { DEFAULT_CONTEXT_WINDOW, defaultTokenCount, } from "./context-window-config";

// ── Public exports ──────────────────────────────────────────

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

export interface CompressionResult {
  compressed: ContextMessage[];
  metadata: CompressionMetadata;
}

/**
 * Main entry point. Compress messages to fit within token budget.
 * No-op when messages already fit.
 *
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

export function compressMessages({
  messages,
  config = DEFAULT_CONTEXT_WINDOW,
  tokenCountFn = defaultTokenCount,
  summarizeFn: _summarizeFn,
}: CompressMessagesOpts,): CompressionResult {
  const originalTokens = calculateTotalTokens(messages, tokenCountFn,);
  const originalCount = messages.length;

  if (messages.length === 0) {
    return {
      compressed: [],
      metadata: zeroMetadata(originalTokens, originalCount,),
    };
  }

  const budget = Math.floor(config.maxContextTokens * config.compressionThreshold,);

  if (originalTokens <= budget) {
    return {
      compressed: messages,
      metadata: {
        ...zeroMetadata(originalTokens, originalCount,),
        budgetExceeded: false,
      },
    };
  }

  // Split: system messages always preserved, conversation messages get windowed
  const { system, conversation, } = splitSystemMessages(messages,);

  // Apply strategy
  const result = applyStrategy(system, conversation, config, budget, tokenCountFn, _summarizeFn,);

  // Reassemble: system messages first, then compressed conversation
  const compressed = [...result.compressedSystem, ...result.compressedConversation,];

  const compressedTokens = calculateTotalTokens(compressed, tokenCountFn,);

  return {
    compressed,
    metadata: {
      originalTokens,
      compressedTokens,
      originalCount,
      compressedCount: compressed.length,
      systemCount: system.length,
      conversationDropped: conversation.length - result.compressedConversation.length,
      conversationKept: result.compressedConversation.length,
      budgetExceeded: true,
    },
  };
}

// ── Internal ─────────────────────────────────────────────────

interface SplitMessages {
  system: ContextMessage[];
  conversation: ContextMessage[];
}

/** Separate leading system messages from conversation messages */
function splitSystemMessages(messages: ContextMessage[],): SplitMessages {
  const system: ContextMessage[] = [];
  const conversation: ContextMessage[] = [];

  let inSystemBlock = true;
  for (const msg of messages) {
    if (inSystemBlock && msg.role === "system") {
      system.push(msg,);
    } else {
      inSystemBlock = false;
      conversation.push(msg,);
    }
  }

  return { system, conversation, };
}

interface StrategyResult {
  compressedSystem: ContextMessage[];
  compressedConversation: ContextMessage[];
}

function applyStrategy(
  system: ContextMessage[],
  conversation: ContextMessage[],
  config: ContextWindowConfig,
  budget: number,
  tokenCountFn: TokenCountFn,
  summarizeFn?: SummarizeFn,
): StrategyResult {
  // System messages always included (they're typically small: instructions, character card)
  const systemTokens = calculateTotalTokens(system, tokenCountFn,);
  const remainingBudget = budget - systemTokens;

  // If system messages alone exceed budget, clip system messages (rare edge case)
  if (remainingBudget <= 0) {
    return {
      compressedSystem: system,
      compressedConversation: [],
    };
  }

  switch (config.strategy) {
    case "truncate": {
      return truncateStrategy(system, conversation, remainingBudget, config, tokenCountFn,);
    }
    case "sliding":
    case "summarize": {
      // Without actual summarizeFn, sliding is the deterministic fallback
      return slidingStrategy(system, conversation, remainingBudget, config, tokenCountFn, summarizeFn,);
    }
    default: {
      return { compressedSystem: system, compressedConversation: conversation, };
    }
  }
}

/** Truncation: keep last N messages, drop oldest beyond budget */
function truncateStrategy(
  system: ContextMessage[],
  conversation: ContextMessage[],
  budget: number,
  config: ContextWindowConfig,
  tokenCountFn: TokenCountFn,
): StrategyResult {
  const kept = selectMessagesByBudget(
    conversation,
    budget,
    config.minRecentMessages,
    config.minTurnsAfterCompression,
    tokenCountFn,
  );

  return {
    compressedSystem: system,
    compressedConversation: kept,
  };
}

/** Sliding window: keep recent messages, optionally summarize older ones */

function slidingStrategy(
  system: ContextMessage[],
  conversation: ContextMessage[],
  budget: number,
  config: ContextWindowConfig,
  tokenCountFn: TokenCountFn,
  _summarizeFn?: SummarizeFn,
): StrategyResult {
  const kept = selectMessagesByBudget(
    conversation,
    budget,
    config.minRecentMessages,
    config.minTurnsAfterCompression,
    tokenCountFn,
  );

  return {
    compressedSystem: system,
    compressedConversation: kept,
  };
}

/**
 * Select messages to keep within budget.
 *
 * Algorithm:
 * 1. Always keep last `minRecentMessages` conversation messages
 * 2. If still over budget, keep only `minTurnsAfterCompression` turns
 * 3. Otherwise, include older messages that fit within budget
 */
function selectMessagesByBudget(
  messages: ContextMessage[],
  budget: number,
  minRecent: number,
  minTurns: number,
  tokenCountFn: TokenCountFn,
): ContextMessage[] {
  if (messages.length <= minRecent) {
    const tokens = calculateTotalTokens(messages, tokenCountFn,);
    if (tokens <= budget) { return messages; }
    // Even minRecent messages over budget — keep minimum turns
    return selectByTurns(messages, budget, minTurns, tokenCountFn,);
  }

  // Always keep the last minRecent messages
  const recentMessages = messages.slice(-minRecent,);
  const recentTokens = calculateTotalTokens(recentMessages, tokenCountFn,);

  if (recentTokens <= budget) {
    // Try to fit older messages too
    const olderMessages = messages.slice(0, -minRecent,);
    return olderMessages.reduceRight<ContextMessage[]>((acc, msg,) => {
      const currentTokens = calculateTotalTokens(acc, tokenCountFn,);
      const msgTokens = tokensForMessage(msg, tokenCountFn,);
      if (currentTokens + msgTokens <= budget) {
        acc.unshift(msg,);
      }
      return acc;
    }, recentMessages,);
  }

  // Recent messages alone over budget — shrink further
  return selectByTurns(recentMessages, budget, minTurns, tokenCountFn,);
}

/** Keep only enough messages to fill `minTurns` complete user+assistant pairs */
function selectByTurns(
  messages: ContextMessage[],
  budget: number,
  minTurns: number,
  tokenCountFn: TokenCountFn,
): ContextMessage[] {
  if (messages.length < 2) { return messages; // Can't form a turn
   }

  // Walk backward, counting turns (user+assistant pairs)
  const result: ContextMessage[] = [];
  let turnsFound = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const currentTokens = calculateTotalTokens(result, tokenCountFn,);
    const msgTokens = tokensForMessage(msg, tokenCountFn,);

    if (currentTokens + msgTokens > budget && turnsFound >= minTurns) {
      break;
    }

    result.unshift(msg,);

    // Count user+assistant as one turn, but don't require strict alternation
    if (msg.role === "assistant" || msg.role === "user") {
      turnsFound++;
    }
  }

  return result;
}

// ── Token helpers ───────────────────────────────────────────

/** Count structural overhead per message (role + wrapping JSON) */
const STRUCTURAL_OVERHEAD_CHARS = 60;

function tokensForMessage(msg: ContextMessage, fn: TokenCountFn,): number {
  let text = msg.content;
  if (msg.name) { text += msg.name; }
  return fn(text,) + fn(String(STRUCTURAL_OVERHEAD_CHARS,),);
}

/** Sum token count across all messages */
export function calculateTotalTokens(
  messages: ContextMessage[],
  tokenCountFn: TokenCountFn = defaultTokenCount,
): number {
  let sum = 0;
  for (const msg of messages) { sum += tokensForMessage(msg, tokenCountFn,); }
  return sum;
}

function zeroMetadata(tokens: number, count: number,): CompressionMetadata {
  return {
    originalTokens: tokens,
    compressedTokens: tokens,
    originalCount: count,
    compressedCount: count,
    systemCount: 0,
    conversationDropped: 0,
    conversationKept: count,
    budgetExceeded: false,
  };
}
