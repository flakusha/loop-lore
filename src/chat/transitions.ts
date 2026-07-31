/**
 * Chat Transitions
 *
 * Handles context transitions during chat: scene changes,
 * context cuts with memory promotion, and location changes.
 *
 * This module computes transition metadata — the actual message
 * archiving and memory promotion are handled by the message routes.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import type { ExtractedMemory, } from "../memory/types";
import {
  CONTEXT_CUT,
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TEMPORAL_TRANSITION,
  TRANSITION_PHRASES,
} from "../regex/transitions";
import { estimateTokens, } from "./token-utils";
import type { ChatTransition, MessageRef, TransitionType, } from "./types";

// ─── Transition Detection ─────────────────────────────────────

/**
 * Detect if a user message narrates a scene change.
 *
 * Looks for common transition patterns: "I walk to...", "We move to...",
 * "The scene shifts to...", location keywords, etc.
 *
 * @param content - User message content
 * @returns Whether this message likely narrates a transition
 */
export function isTransitionMessage(content: string,): boolean {
  const lower = content.toLowerCase();
  const transitionPatterns = [
    MOVEMENT_VERBS,
    SCENE_CHANGE,
    TRANSITION_PHRASES,
    TEMPORAL_TRANSITION,
  ];
  for (const p of transitionPatterns) {
    if (p.test(lower,)) { return true; }
  }
  return false;
}

/**
 * Determine the transition type from message content.
 *
 * @param content - Message content
 * @param hasLocationChange - Whether a new location is being set
 * @returns The detected transition type
 */
export function detectTransitionType(
  content: string,
  hasLocationChange: boolean,
): TransitionType {
  if (hasLocationChange) { return "location_change"; }
  const lower = content.toLowerCase();
  if (CONTEXT_CUT.test(lower,)) { return "context_cut"; }
  return "description";
}

// ─── Transition Creation ───────────────────────────────────────

/**
 * Create a chat transition event from a message.
 *
 * @param params - Transition parameters
 * @returns A new ChatTransition
 */
export function createTransition(params: {
  actorId: string;
  narration?: string;
  promotedMemoryIds?: string[];
  newLocationId?: string;
},): ChatTransition {
  return {
    type: params.newLocationId ? "location_change" : "description",
    actorId: params.actorId,
    narration: params.narration,
    promotedMemoryIds: params.promotedMemoryIds ?? [],
    newLocationId: params.newLocationId,
    createdAt: new Date().toISOString(),
  };
}

// ─── Context Cut ───────────────────────────────────────────────

/**
 * Determine which messages should be promoted during a context cut.
 *
 * When the context window overflows, older messages are promoted to
 * long-term memory. This function selects which messages to promote
 * based on age and importance.
 *
 * @param messages - All messages in the chat (chronological)
 * @param maxTokens - Maximum token budget
 * @param promotionThreshold - Minimum score for promotion (0-1, default 0.6)
 * @returns Message IDs to promote to memory
 */
export function selectMessagesForPromotion(
  messages: MessageRef[],
  maxTokens: number,
  promotionThreshold = 0.6,
): string[] {
  const promoted: string[] = [];
  let totalTokens = 0;

  for (const msg of messages) {
    const msgTokens = msg.tokenCount || estimateTokens(msg.content,);
    totalTokens += msgTokens;

    if (totalTokens <= maxTokens) { continue; }

    // Use composite score when available; fall back to length heuristic
    const effectiveScore = msg.score ?? (msg.content.length > 50
      ? Math.min(1, msg.content.length / 200,)
      : 0);
    if (effectiveScore >= promotionThreshold) {
      promoted.push(msg.messageId,);
    }
  }
  return promoted;
}

// ─── Memory Promotion Pipeline ─────────────────────────────────

/**
 * Promote trimmed messages to long-term memory.
 *
 * Called when the context window overflows. Extracts memories from
 * promoted messages and stores them with scope detection.
 *
 * Scope detection:
 * - "character": message is from/about a character in the chat
 * - "world": message contains world-building information
 * - "assistant": message is system-generated or meta-information
 *
 * @param db - Kysely instance
 * @param params - Promotion parameters
 * @returns Array of stored memory IDs
 */
export async function promoteMessagesToMemories(
  db: Kysely<DB>,
  params: {
    messages: MessageRef[];
    maxTokens: number;
    actorId: string;
    chatId: string;
    worldId?: string | null;
    participantIds: string[];
    promotionThreshold?: number;
  },
): Promise<string[]> {
  const {
    messages,
    maxTokens,
    actorId,
    chatId,
    worldId,
    participantIds,
    promotionThreshold = 0.6,
  } = params;

  const messageIds = selectMessagesForPromotion(messages, maxTokens, promotionThreshold,);
  if (messageIds.length === 0) { return []; }

  const promotedIds: string[] = [];

  for (const msgId of messageIds) {
    const msg = messages.find((m,) => m.messageId === msgId);
    if (!msg) { continue; }

    // Detect scope from message content
    const scope = detectScope(msg.content, msg.role, worldId ?? null, participantIds,);

    // Extract memories from the message content
    const extracted = [{
      content: msg.content,
      memoryType: "episodic" as const,
      confidence: msg.score ?? 0.7,
      importance: Math.min(10, Math.max(1, Math.ceil((msg.score ?? 0.5) * 10,),),),
      keywords: [],
    },];

    // Store with scope metadata
    const stored = await storeMemoriesWithScope(db, actorId, chatId, extracted, scope,);
    promotedIds.push(...stored,);
  }

  return promotedIds;
}

/**
 * Detect memory scope from message content.
 */
function detectScope(
  _content: string,
  role: string,
  worldId: string | null,
  _participantIds: string[],
): "character" | "world" | "assistant" {
  if (role === "system" || role === "assistant") {
    return "assistant";
  }
  if (worldId) {
    return "world";
  }
  return "character";
}

/**
 * Store extracted memories with explicit scope.
 * Extends storeMemories by setting scope on inserted memories.
 */
async function storeMemoriesWithScope(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  memories: ExtractedMemory[],
  scope: "character" | "world" | "assistant",
): Promise<string[]> {
  const stored: string[] = [];

  for (const memory of memories) {
    const existing = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("content", "=", memory.content,)
      .executeTakeFirst();

    if (existing) { continue; }

    const id = randomUUID();
    await db
      .insertInto("actor_memories",)
      .values({
        id,
        actor_id: actorId,
        content: memory.content,
        memory_type: memory.memoryType,
        confidence: memory.confidence,
        importance: memory.importance,
        keywords: JSON.stringify(memory.keywords,),
        source_chat_id: chatId,
        scope,
        privacy: "shared",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    stored.push(id,);
  }

  return stored;
}
