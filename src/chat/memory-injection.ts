/**
 * Chat Memory Injection
 *
 * Bridges the memory system with the chat context window.
 * Fetches memories for chat participants, applies provision
 * pipeline (scope/privacy/shareability), then applies injection
 * system (probability/comfort) before injecting into context.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  selectMemoriesForInjection,
} from "../memory";
import type {
  InjectionContext,
} from "../memory";
import type { MemoryEntry, MemoryPrivacy, MemoryScope, } from "../memory/types";
import { estimateTokens, } from "./token-utils";
import type { ContextWindow, MemoryRef, } from "./types";

/** Actor-specific memory context for injection decisions. */
export interface ActorMemoryContext {
  actorId: string;
  worldId: string | null;
  locationId: string | null;
  moodModifier: number;
  intimacyScore: number;
}

/**
 * Fetch memories for a chat and inject them into the context window.
 *
 * Steps:
 * 1. Fetch memories from actor_memories for each participant
 * 2. Apply provision pipeline (scope/privacy/shareability)
 * 3. Apply injection system (probability/comfort)
 * 4. Convert to MemoryRef and inject into context
 *
 * @param context - Current context window
 * @param database - Database instance
 * @param chatId - Chat ID
 * @param worldId - World ID (if any)
 * @param participants - Chat participant actor IDs
 * @param userMessage - Current user message (for keyword extraction)
 * @returns Updated context window with memories injected
 */
export async function injectChatMemories(
  context: ContextWindow,
  database: Kysely<DB>,
  chatId: string,
  worldId: string | null,
  participants: string[],
  userMessage: string,
): Promise<ContextWindow> {
  // Skip if memory injection is disabled
  if (!context.features.memoryInjection) {
    return context;
  }

  // Extract keywords from user message for relevance matching
  const currentKeywords = extractKeywords(userMessage,);

  const allMemories: MemoryRef[] = [];

  // For each participant, fetch and evaluate their memories
  for (const actorId of participants) {
    const actorMemories = await fetchActorMemories(database, actorId, worldId,);

    if (actorMemories.length === 0) { continue; }

    // Build injection context for this actor
    const injectionCtx: InjectionContext = {
      chatId,
      worldId,
      locationId: null, // TODO: resolve from chat
      isPrivateChat: participants.length === 1,
      participantCount: participants.length,
      turnNumber: context.retained.length, // approximate
      currentKeywords,
      averageIntimacy: 50, // TODO: resolve from relationships
      moodModifier: 0, // TODO: resolve from mood service
    };

    // Apply injection decision for each memory
    const { selected, } = selectMemoriesForInjection(
      actorMemories,
      DEFAULT_INJECTION_CONFIG,
      injectionCtx,
      DEFAULT_COMFORT,
    );

    // Convert to MemoryRef
    for (const memory of selected) {
      const tokenCount = estimateTokens(memory.content,);
      allMemories.push({
        memoryId: memory.id,
        actorId,
        source: "character",
        content: memory.content,
        tokenCount,
        relevanceScore: memory.importance,
      },);
    }
  }

  // Sort by relevance and inject into context
  allMemories.sort((a, b,) => b.relevanceScore - a.relevanceScore);

  return injectMemoriesIntoContext(context, allMemories,);
}

/**
 * Fetch actor memories from the database.
 * Returns memories with full metadata for injection evaluation.
 */
async function fetchActorMemories(
  database: Kysely<DB>,
  actorId: string,
  worldId: string | null,
): Promise<MemoryEntry[]> {
  const rows = await database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where((eb,) => {
      // Include memories that are world-specific (matching worldId) or world-agnostic (null)
      if (worldId) {
        return eb.or([
          eb("world_id", "=", worldId,),
          eb("world_id", "is", null,),
        ],);
      }
      return eb("world_id", "is", null,);
    },)
    .orderBy("importance", "desc",)
    .limit(50,)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    actorId: row.actor_id,
    content: row.content,
    memoryType: row.memory_type,
    confidence: row.confidence,
    importance: row.importance,
    keywords: JSON.parse(row.keywords || "[]",) as string[],
    pinned: row.pinned === 1,
    scope: row.scope as MemoryScope,
    privacy: row.privacy as MemoryPrivacy,
    shareability: row.shareability,
    sourceChatId: row.source_chat_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Extract keywords from a message for relevance matching.
 */
function extractKeywords(message: string,): string[] {
  if (!message) { return []; }

  // Simple keyword extraction: split on whitespace, lowercase, filter short words
  return message
    .toLowerCase()
    .split(/\s+/,)
    .filter((word,) => word.length > 3)
    .slice(0, 20,); // max 20 keywords
}

/**
 * Inject memories into the context window.
 * Respects remaining token budget.
 */
function injectMemoriesIntoContext(
  context: ContextWindow,
  memories: MemoryRef[],
): ContextWindow {
  const remaining = context.maxTokens - context.totalTokens;
  if (remaining <= 0) { return context; }

  const accepted: MemoryRef[] = [];
  let addedTokens = 0;

  for (const m of memories) {
    if (addedTokens + m.tokenCount > remaining) { continue; }
    accepted.push(m,);
    addedTokens += m.tokenCount;
  }

  return {
    ...context,
    injectedMemories: [...context.injectedMemories, ...accepted,],
    totalTokens: context.totalTokens + addedTokens,
    usagePercentage: context.maxTokens > 0
      ? Math.round(((context.totalTokens + addedTokens) / context.maxTokens) * 100,)
      : 0,
  };
}
