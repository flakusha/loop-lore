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

import type { CountableMessage, } from "./token-counter";

/** Keywords that signal high-importance content */
const LORE_KEYWORDS = ["lore", "backstory", "history", "legend", "myth", "prophecy", "secret", "revelation",];
const DECISION_KEYWORDS = ["decide", "decided", "choose", "chose", "agreement", "promise", "vow", "oath",];
const EMOTION_KEYWORDS = ["feel", "feeling", "emotion", "love", "hate", "fear", "anger", "joy", "sadness", "desire",];
const LORE_CONTENT_KEYWORDS = ["world", "realm", "kingdom", "empire", "city", "village", "castle", "temple",];

/** Weights for each scoring factor (must sum to 1.0) */
export const SCORING_WEIGHTS = {
  recency: 0.3,
  role: 0.2,
  keywords: 0.2,
  memoryLinks: 0.15,
  attachments: 0.1,
  reactions: 0.05,
} as const;

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

/** Default configuration (balanced) */
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  strategy: "balanced",
  keepThreshold: 0.3,
  promoteThreshold: 0.6,
  targetTokens: 20_000,
  insertSummary: true,
};

/** Strategy-specific overrides */
export const STRATEGY_CONFIGS: Record<PruningStrategy, Partial<PruningConfig>> = {
  aggressive: { keepThreshold: 0.4, promoteThreshold: 0.7, },
  conservative: { keepThreshold: 0.2, promoteThreshold: 0.5, },
  balanced: { keepThreshold: 0.3, promoteThreshold: 0.6, },
};

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

/**
 * Score a single message based on multiple factors.
 *
 * @param msg - Message to score
 * @returns Message score with reasons
 */
export function scoreMessage(msg: ScorableMessage,): MessageScore {
  const reasons: string[] = [];

  // Recency: recent messages score higher (0.3 weight)
  const recencyScore = msg.total > 0 ? msg.index / msg.total : 0.5;
  if (recencyScore > 0.7) { reasons.push("recent",); }

  // Role: user/character messages score higher than system (0.2 weight)
  const roleScore = msg.role === "user" || msg.role === "character" ? 1.0 : 0.3;
  if (roleScore > 0.5) { reasons.push("participant",); }

  // Keywords: lore, decision, emotion, location (0.2 weight)
  const lowerContent = msg.content.toLowerCase();
  const loreMatches = LORE_KEYWORDS.filter((kw,) => lowerContent.includes(kw,)).length;
  const decisionMatches = DECISION_KEYWORDS.filter((kw,) => lowerContent.includes(kw,)).length;
  const emotionMatches = EMOTION_KEYWORDS.filter((kw,) => lowerContent.includes(kw,)).length;
  const locationMatches = LORE_CONTENT_KEYWORDS.filter((kw,) => lowerContent.includes(kw,)).length;
  const keywordScore = Math.min(1.0, (loreMatches + decisionMatches + emotionMatches + locationMatches) / 4,);
  if (keywordScore > 0.3) {
    reasons.push(`keywords(${loreMatches + decisionMatches + emotionMatches + locationMatches})`,);
  }

  // Memory links (0.15 weight)
  const memoryLinkScore = msg.hasMemoryLink ? 1.0 : 0;
  if (memoryLinkScore > 0) { reasons.push("memory-linked",); }

  // Attachments (0.1 weight)
  const attachmentScore = msg.hasAttachment ? 1.0 : 0;
  if (attachmentScore > 0) { reasons.push("has-attachment",); }

  // Reactions (0.05 weight)
  const reactionScore = Math.min(1.0, (msg.reactionCount ?? 0) / 5,);
  if (reactionScore > 0) { reasons.push(`reactions(${msg.reactionCount})`,); }

  const relevanceScore = recencyScore * SCORING_WEIGHTS.recency +
    roleScore * SCORING_WEIGHTS.role +
    keywordScore * SCORING_WEIGHTS.keywords +
    memoryLinkScore * SCORING_WEIGHTS.memoryLinks +
    attachmentScore * SCORING_WEIGHTS.attachments +
    reactionScore * SCORING_WEIGHTS.reactions;

  // Importance is a separate dimension: content type matters more than recency
  const importanceScore = keywordScore * 0.5 +
    memoryLinkScore * 0.2 +
    attachmentScore * 0.2 +
    (msg.role === "user" || msg.role === "character" ? 0.1 : 0);

  return {
    messageId: msg.id,
    relevanceScore,
    importanceScore,
    combinedScore: relevanceScore,
    shouldPromote: importanceScore >= 0.6,
    shouldPrune: false, // Set by pruneMessages
    reasons,
  };
}

/**
 * Prune messages to fit within a token budget using score-based removal.
 *
 * Algorithm:
 * 1. Score all messages
 * 2. Sort by combinedScore (ascending)
 * 3. Remove lowest-scoring messages until under budget
 * 4. Promote high-importance messages to memory before removal
 * 5. Insert a system message noting what was pruned
 *
 * @param messages - All messages in the chat
 * @param config - Pruning configuration
 * @returns Prune result with kept/promoted/pruned messages
 */
export function pruneMessages(
  messages: ScorableMessage[],
  config: PruningConfig = DEFAULT_PRUNING_CONFIG,
): PruneResult {
  if (messages.length === 0) {
    return { kept: [], promoted: [], pruned: [], tokensSaved: 0, };
  }

  // Score all messages
  const scores = messages.map((msg,) => scoreMessage(msg,));

  // Sort by score ascending (lowest first = most likely to prune)
  const sortedIndices = Array.from({ length: scores.length, }, (_, i,) => i,).sort(
    (a, b,) => scores[a]!.combinedScore - scores[b]!.combinedScore,
  );

  // Determine which to prune
  const toPrune = new Set<number>();
  let currentTokens = messages.reduce((sum, msg,) => sum + Math.ceil(msg.content.length * 0.3,), 0,);

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

  // Partition messages
  const kept: ScorableMessage[] = [];
  const promoted: ScorableMessage[] = [];
  const pruned: ScorableMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
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

  // Build summary message
  let summary: string | undefined;
  if (config.insertSummary && pruned.length > 0) {
    const promotedCount = promoted.length;
    const prunedCount = pruned.length;
    summary = `[Context Pruned] Removed ${prunedCount} message(s)` +
      (promotedCount > 0 ? `, promoted ${promotedCount} to memory` : "") +
      `. Strategy: ${config.strategy}.`;
  }

  const tokensSaved = pruned.reduce((sum, msg,) => sum + Math.ceil(msg.content.length * 0.3,), 0,);

  return {
    kept,
    promoted,
    pruned,
    summary,
    tokensSaved,
  };
}
