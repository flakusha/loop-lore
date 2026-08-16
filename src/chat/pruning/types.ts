// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CountableMessage, } from "../token-counter";

/** Pruning strategy configuration */
export type PruningStrategy = "aggressive" | "conservative" | "balanced";

/** Configuration for the pruning system */
export interface PruningConfig {
  /** Strategy determines how aggressively messages are pruned */
  strategy: PruningStrategy;
  /** Minimum combined score to keep a message (0–1) */
  keepThreshold: number;
  /** Minimum importance score to promote to memory before removal (0–1) */
  promoteThreshold: number;
  /** Maximum tokens to target after pruning */
  targetTokens: number;
  /** Whether to insert a system message noting what was pruned */
  insertSummary: boolean;
}

/** Score for a single message */
export interface MessageScore {
  messageId: string;
  relevanceScore: number;
  importanceScore: number;
  combinedScore: number;
  shouldPromote: boolean;
  shouldPrune: boolean;
  reasons: string[];
}

/** Result of a pruning operation */
export interface PruneResult {
  /** Messages to keep (in original order) */
  kept: CountableMessage[];
  /** Messages promoted to memory before removal */
  promoted: CountableMessage[];
  /** Messages pruned (removed) */
  pruned: CountableMessage[];
  /** Summary message inserted if insertSummary is true */
  summary?: string;
  /** Total tokens saved */
  tokensSaved: number;
}

/** Extended message with metadata for scoring */
export interface ScorableMessage extends CountableMessage {
  id: string;
  /** Index in the original message list (0 = oldest) */
  index: number;
  /** Total message count (for recency calculation) */
  total: number;
  /** Whether this message has memory links */
  hasMemoryLink?: boolean;
  /** Whether this message has attachments */
  hasAttachment?: boolean;
  /** Number of reactions on this message */
  reactionCount?: number;
}
