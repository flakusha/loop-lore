// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { DEFAULT_PRUNING_CONFIG, } from "./constants";
import { scoreMessage, } from "./score";
import type { MessageScore, PruneResult, PruningConfig, ScorableMessage, } from "./types";

/**
 * Prune messages to fit within a token budget using score-based removal.
 *
 * Algorithm:
 * 1. Score all messages
 * 2. Sort by combinedScore (ascending)
 * 3. Remove lowest-scoring messages until under budget
 * 4. Promote high-importance messages to memory before removal
 * 5. Insert a system message noting what was pruned
 * @param messages - All messages in the chat
 * @param config - Pruning configuration
 * @returns Prune result with kept/promoted/pruned messages
 */

/**
 * Choose which scored messages to prune to fit the token target.
 * @param messages
 * @param scores
 * @param sortedIndices
 * @param config
 */
function selectMessagesToPrune(
  messages: ScorableMessage[],
  scores: MessageScore[],
  sortedIndices: number[],
  config: PruningConfig,
): Set<number> {
  const toPrune = new Set<number>();
  let currentTokens = 0;
  for (const msg of messages) { currentTokens += Math.ceil(msg.content.length * 0.3,); }

  for (const idx of sortedIndices) {
    if (currentTokens <= config.targetTokens) { break; }

    const score = scores[idx];
    const msg = messages[idx];
    if (!score || !msg) { continue; }

    const msgTokens = Math.ceil(msg.content.length * 0.3,);
    // Never prune if it would drop below target
    if (currentTokens - msgTokens < config.targetTokens * 0.8) { break; }

    toPrune.add(idx,);
    currentTokens -= msgTokens;
    score.shouldPrune = true;
  }
  return toPrune;
}

/**
 * Partition messages into kept / promoted / pruned buckets.
 * @param messages
 * @param scores
 * @param toPrune
 */
function partitionMessages(
  messages: ScorableMessage[],
  scores: MessageScore[],
  toPrune: Set<number>,
): { kept: ScorableMessage[]; promoted: ScorableMessage[]; pruned: ScorableMessage[] } {
  const kept: ScorableMessage[] = [];
  const promoted: ScorableMessage[] = [];
  const pruned: ScorableMessage[] = [];

  for (const [i, msg,] of messages.entries()) {
    const score = scores[i];
    if (!msg || !score) { continue; }

    if (toPrune.has(i,)) {
      if (score.shouldPromote) {
        promoted.push(msg,);
      }
      pruned.push(msg,);
    } else {
      kept.push(msg,);
    }
  }
  return { kept, promoted, pruned, };
}

/**
 * @param messages
 * @param config
 */
export function pruneMessages(
  messages: ScorableMessage[],
  config: PruningConfig = DEFAULT_PRUNING_CONFIG,
): PruneResult {
  if (messages.length === 0) {
    return { kept: [], promoted: [], pruned: [], tokensSaved: 0, };
  }

  // Score all messages
  const scores = Array.from(messages, (msg,) => scoreMessage(msg,),);

  // Sort by score ascending (lowest first = most likely to prune)
  const sortedIndices = Array.from({ length: scores.length, }, (_, i,) => i,).sort(
    (a, b,) => scores[a]!.combinedScore - scores[b]!.combinedScore,
  );

  const toPrune = selectMessagesToPrune(messages, scores, sortedIndices, config,);
  const { kept, promoted, pruned, } = partitionMessages(messages, scores, toPrune,);

  // Build summary message
  let summary: string | undefined;
  if (config.insertSummary && pruned.length > 0) {
    const promotedCount = promoted.length;
    const prunedCount = pruned.length;
    summary = `[Context Pruned] Removed ${prunedCount} message(s)${
      promotedCount > 0 ? `, promoted ${promotedCount} to memory` : ""
    }. Strategy: ${config.strategy}.`;
  }

  let tokensSaved = 0;
  for (const msg of pruned) { tokensSaved += Math.ceil(msg.content.length * 0.3,); }

  return {
    kept,
    promoted,
    pruned,
    summary,
    tokensSaved,
  };
}
