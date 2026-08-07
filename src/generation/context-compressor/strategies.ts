import type { ContextMessage, ContextWindowConfig, SummarizeFn, TokenCountFn, } from "../context-window-config";
import { calculateTotalTokens, tokensForMessage, } from "./tokens";
import type { StrategyResult, } from "./types";

/**
 * Apply the configured compression strategy given a budget.
 * System messages are always included; only the conversation is windowed.
 */
export function applyStrategy(
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
