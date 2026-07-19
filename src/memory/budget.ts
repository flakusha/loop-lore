/**
 * Memory token budget management.
 *
 * Enforces a configurable token limit for memories injected into prompts.
 * Drops low-confidence memories first; pinned memories are never dropped.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import type { MemoryBudgetConfig, } from "./types";

/** Default budget: 1024 tokens (~4K chars). */
const DEFAULT_MAX_TOKENS = 1024;

/** Rough chars-per-token estimate for English text. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text. Not exact — good enough for budget enforcement.
 */
export function estimateTokens(text: string,): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN,);
}

/**
 * Select memories within a token budget.
 * Returns memories sorted by importance, filtered to fit the budget.
 */
export function selectWithinBudget<
  T extends { content: string; confidence: number; importance: number; pinned?: boolean },
>(
  memories: T[],
  config: Partial<MemoryBudgetConfig> = {},
): T[] {
  const { maxTokens = DEFAULT_MAX_TOKENS, respectPins = true, } = config;

  // Separate pinned and unpinned
  const pinned = respectPins ? memories.filter((m,) => m.pinned) : [];
  const unpinned = memories.filter((m,) => !m.pinned);

  // Sort unpinned by importance desc, then confidence desc
  unpinned.sort((a, b,) => {
    if (b.importance !== a.importance) { return b.importance - a.importance; }
    return b.confidence - a.confidence;
  },);

  // Calculate budget consumed by pinned memories
  const pinnedTokens = pinned.reduce((sum, m,) => sum + estimateTokens(m.content,), 0,);
  const remaining = maxTokens - pinnedTokens;

  if (remaining <= 0) {
    return pinned;
  }

  // Greedily add unpinned memories until budget exhausted
  const selected: T[] = [...pinned,];
  let usedTokens = 0;

  for (const memory of unpinned) {
    const memTokens = estimateTokens(memory.content,);
    if (usedTokens + memTokens <= remaining) {
      selected.push(memory,);
      usedTokens += memTokens;
    }
  }

  return selected;
}

/**
 * Query memories for an actor, respecting token budget.
 * Applies importance/confidence filtering and budget enforcement.
 */
export async function getMemoriesWithinBudget(
  db: Kysely<DB>,
  actorId: string,
  config: Partial<MemoryBudgetConfig> = {},
): Promise<Array<{ content: string; memory_type: string; importance: number; confidence: number; pinned: boolean }>> {
  const { maxTokens = DEFAULT_MAX_TOKENS, minConfidence = 0.3, respectPins = true, } = config;

  // Fetch all memories for the actor, ordered by importance
  const allMemories = await db
    .selectFrom("actor_memories",)
    .select(["content", "memory_type", "importance", "confidence",],)
    .where("actor_id", "=", actorId,)
    .orderBy("importance", "desc",)
    .execute();

  // Apply confidence filter (pinned memories bypass this)
  const filtered = allMemories.filter((m,) => m.confidence >= minConfidence);

  // Apply budget
  return selectWithinBudget(
    filtered.map((m,) => ({ ...m, pinned: false, })),
    { maxTokens, respectPins, },
  );
}
