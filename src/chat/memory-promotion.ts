/**
 * Context Cut & Memory Promotion
 *
 * Bridges the pruning pipeline with memory storage. When messages are
 * pruned from context, important ones are promoted to long-term memory
 * before removal. This ensures no critical context is lost.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db";
import { getLogger, } from "../logger";
import type { MessageRef, } from "./types";

function getLog() {
  return getLogger().child({ module: "memory-promotion", },);
}

/** A message that was promoted from context to long-term memory. */
export interface PromotedMessage {
  message: MessageRef;
  /** Reason this message was promoted (score-based, explicit, etc.) */
  reason: string;
  /** Extracted memory content (may differ from original message content) */
  memoryContent: string;
  /** Memory type classification */
  memoryType: "episodic" | "semantic" | "procedural";
  /** Importance score (0-1) */
  importance: number;
  /** Keywords extracted from the message */
  keywords: string[];
}

/** Options for the promotion pipeline. */
export interface PromotionOpts {
  db: Kysely<DB>;
  actorId: string;
  chatId: string;
  worldId: string | null;
  /** Messages promoted by the pruning pipeline */
  promotedMessages: MessageRef[];
  /** Scoring metadata for each promoted message (optional) */
  scores?: Map<string, { combinedScore: number; reasons: string[] }>;
}

/** Result of the promotion pipeline. */
export interface PromotionResult {
  /** Number of memories actually stored */
  stored: number;
  /** Number of messages that were promotion candidates */
  candidates: number;
  /** IDs of stored memories */
  memoryIds: string[];
}

/**
 * Promote pruned messages to long-term memory.
 *
 * Takes messages identified by the pruning pipeline for promotion,
 * classifies their content, and stores them as actor_memories.
 * Runs as a non-blocking background task.
 *
 * @param opts - Promotion options including DB, actor, chat, and promoted messages
 * @returns Result with counts of stored memories
 */
export async function promoteMessagesToMemory(
  opts: PromotionOpts,
): Promise<PromotionResult> {
  const { db, actorId, chatId, worldId, promotedMessages, scores, } = opts;

  if (promotedMessages.length === 0) {
    return { stored: 0, candidates: 0, memoryIds: [], };
  }

  const candidates: PromotedMessage[] = [];

  for (const msg of promotedMessages) {
    const classification = classifyMessage(msg,);
    const scoreData = scores?.get(msg.messageId,);
    const importance = scoreData?.combinedScore ?? classifyImportance(msg,);
    const keywords = extractKeywords(msg.content,);

    candidates.push({
      message: msg,
      reason: scoreData?.reasons.join(", ",) ?? "context_overflow",
      memoryContent: summarizeForMemory(msg.content,),
      memoryType: classification.memoryType,
      importance,
      keywords,
    },);
  }

  // Filter: only promote messages above minimum importance threshold
  const toStore = candidates.filter((c,) => c.importance >= 0.3);

  if (toStore.length === 0) {
    getLog().debug("No promotion candidates above threshold", { candidates: candidates.length, },);
    return { stored: 0, candidates: candidates.length, memoryIds: [], };
  }

  const now = new Date().toISOString();
  const memoryIds: string[] = [];

  // Store in batches to avoid overwhelming the DB
  const BATCH_SIZE = 10;
  for (let i = 0; i < toStore.length; i += BATCH_SIZE) {
    const batch = toStore.slice(i, i + BATCH_SIZE,);
    const values = batch.map((c,) => ({
      id: randomUUID(),
      actor_id: actorId,
      content: c.memoryContent,
      memory_type: c.memoryType,
      confidence: Math.min(1, c.importance + 0.2,),
      importance: c.importance,
      keywords: JSON.stringify(c.keywords,),
      source_chat_id: chatId,
      world_id: worldId,
      scope: "character" as const,
      privacy: "shared" as const,
      created_at: now,
      updated_at: now,
    }));

    await db
      .insertInto("actor_memories",)
      .values(values,)
      .execute();

    memoryIds.push(...values.map((v,) => v.id),);
  }

  getLog().info("Promoted messages to memory", {
    actorId,
    chatId,
    candidates: candidates.length,
    stored: toStore.length,
  },);

  return {
    stored: toStore.length,
    candidates: candidates.length,
    memoryIds,
  };
}

// ── Classification Helpers ──────────────────────────────────

/** Classify a message into memory type based on content patterns. */
function classifyMessage(
  msg: MessageRef,
): { memoryType: "episodic" | "semantic" | "procedural" } {
  const content = msg.content.toLowerCase();

  // Episodic: specific events, actions, sequences
  if (
    /\b(then|after|before|during|while|suddenly|finally)\b/.test(content,) ||
    /\b(visited|arrived|left|entered|found|discovered|defeated)\b/.test(content,)
  ) {
    return { memoryType: "episodic", };
  }

  // Procedural: patterns, preferences, learned behaviors
  if (
    /\b(prefer|always|never|usually|tends to|likes to|hates)\b/.test(content,) ||
    /\b(learned|discovered that|realized)\b/.test(content,)
  ) {
    return { memoryType: "procedural", };
  }

  // Semantic: facts, names, descriptions, relationships
  return { memoryType: "semantic", };
}

/** Classify importance based on message content heuristics. */
function classifyImportance(msg: MessageRef,): number {
  let score = 0.3; // baseline
  const content = msg.content;

  // Role weight: user messages are generally more important
  if (msg.role === "user") { score += 0.1; }

  // Length heuristic: longer messages tend to contain more important info
  if (content.length > 200) { score += 0.1; }
  if (content.length > 500) { score += 0.1; }

  // Entity density: messages with names/places are more important
  const entityPattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
  const entityMatches = content.match(entityPattern,);
  if (entityMatches && entityMatches.length >= 3) { score += 0.1; }

  // Decision/action language
  if (/\b(decided|chose|promised|swore|vowed|committed)\b/i.test(content,)) {
    score += 0.15;
  }

  // Emotional content
  if (/\b(angry|happy|sad|afraid|excited|love|hate)\b/i.test(content,)) {
    score += 0.05;
  }

  return Math.min(1, score,);
}

/** Extract keywords from content using simple heuristics. */
function extractKeywords(content: string,): string[] {
  const words = content.split(/\s+/,);
  const keywords: string[] = [];

  // Proper nouns (potential entities)
  for (const word of words) {
    if (/^[A-Z][a-z]+$/.test(word,) && word.length > 2) {
      keywords.push(word.toLowerCase(),);
    }
  }

  // Action verbs
  const actionVerbs = content.match(
    /\b(?:visited|found|defeated|created|built|learned|discovered|fought|helped|saved|killed)\b/gi,
  );
  if (actionVerbs) {
    keywords.push(...actionVerbs.map((v,) => v.toLowerCase()),);
  }

  return [...new Set(keywords,),].slice(0, 10,);
}

/** Summarize message content for memory storage. */
function summarizeForMemory(content: string,): string {
  // Truncate to reasonable length for a memory
  const MAX_LENGTH = 500;
  if (content.length <= MAX_LENGTH) { return content; }

  // Try to cut at sentence boundary
  const truncated = content.slice(0, MAX_LENGTH,);
  const lastSentence = truncated.lastIndexOf(".",);
  if (lastSentence > MAX_LENGTH * 0.6) {
    return truncated.slice(0, lastSentence + 1,);
  }

  return `${truncated}...`;
}
