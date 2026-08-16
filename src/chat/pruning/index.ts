// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Smart Context Pruning (FEAT-072)
 *
 * Score-based pruning of chat context to fit token budget.
 * Older, low-importance messages are removed while important content
 * (character moments, lore, decisions) is promoted to long-term memory.
 *
 * Builds on the existing ContextCompactor (85% threshold) by adding
 * per-message importance scoring and memory promotion before removal.
 */
export {
  DEFAULT_PRUNING_CONFIG,
  SCORING_WEIGHTS,
  STRATEGY_CONFIGS,
} from "./constants";
export { pruneMessages, } from "./prune";
export { scoreMessage, } from "./score";

export type {
  MessageScore,
  PruneResult,
  PruningConfig,
  PruningStrategy,
  ScorableMessage,
} from "./types";
