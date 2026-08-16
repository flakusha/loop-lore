// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { DEFAULT_CONTEXT_WINDOW, defaultTokenCount, } from "../context-window-config";
import { splitSystemMessages, } from "./split";
import { applyStrategy, } from "./strategies";
import { calculateTotalTokens, zeroMetadata, } from "./tokens";
import type { CompressionResult, CompressMessagesOpts, } from "./types";

/**
 * Main entry point. Compress messages to fit within token budget.
 * No-op when messages already fit.
 */
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
