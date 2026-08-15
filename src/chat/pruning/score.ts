import {
  DECISION_KEYWORDS,
  EMOTION_KEYWORDS,
  LORE_CONTENT_KEYWORDS,
  LORE_KEYWORDS,
  SCORING_WEIGHTS,
} from "./constants";
import type { MessageScore, ScorableMessage, } from "./types";

/** Count how many of the given keywords appear in lowercased content. */
function countKeywordMatches(lowerContent: string, keywords: readonly string[],): number {
  let matches = 0;
  for (const kw of keywords) { if (lowerContent.includes(kw,)) { matches++; } }
  return matches;
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
  const roleScore = msg.role === "user" || msg.role === "character" ? 1 : 0.3;
  if (roleScore > 0.5) { reasons.push("participant",); }

  // Keywords: lore, decision, emotion, location (0.2 weight)
  const lowerContent = msg.content.toLowerCase();
  const loreMatches = countKeywordMatches(lowerContent, LORE_KEYWORDS,);
  const decisionMatches = countKeywordMatches(lowerContent, DECISION_KEYWORDS,);
  const emotionMatches = countKeywordMatches(lowerContent, EMOTION_KEYWORDS,);
  const locationMatches = countKeywordMatches(lowerContent, LORE_CONTENT_KEYWORDS,);
  const totalMatches = loreMatches + decisionMatches + emotionMatches + locationMatches;
  const keywordScore = Math.min(1, totalMatches / 4,);
  if (keywordScore > 0.3) {
    reasons.push(`keywords(${totalMatches})`,);
  }

  // Memory links (0.15 weight)
  const memoryLinkScore = msg.hasMemoryLink ? 1 : 0;
  if (memoryLinkScore > 0) { reasons.push("memory-linked",); }

  // Attachments (0.1 weight)
  const attachmentScore = msg.hasAttachment ? 1 : 0;
  if (attachmentScore > 0) { reasons.push("has-attachment",); }

  // Reactions (0.05 weight)
  const reactionScore = Math.min(1, (msg.reactionCount ?? 0) / 5,);
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
