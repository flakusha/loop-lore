// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { detectScope, storeMemoriesWithScope, } from "./memory-promotion";
import { requireActorExists, requireChatParticipant, } from "./ownership";
import { estimateTokens, } from "./token-utils";
import { classifyTransition, } from "./transition-classifier";
import type { ChatTransition, MessageRef, TransitionClassification, } from "./types";

// ─── Transition Detection ─────────────────────────────────────

/**
 * Classify a message as a transition with full details.
 *
 * Uses regex-first, AUX-LLM-fallback detection for accurate classification.
 * Returns structured classification with type, confidence, and location hint.
 *
 * Ownership: when `ownership` is provided, the actor MUST be a participant
 * of the chat — otherwise this throws `OwnershipError`. When only `userId`
 * is provided, the user MUST exist as an actor — this prevents a forged
 * `userId` from pulling another user's BYO apiKey via the underlying
 * `classifyTransition` call.
 * @param content - User message content
 * @param recentMessages - Last 1-2 messages for context (optional)
 * @param config - Application config
 * @param db - Kysely instance
 * @param userId - User ID for BYO apiKey resolution (optional)
 * @param ownership - Optional ownership context for participant enforcement
 * @param ownership.chatId
 * @param ownership.actorId
 * @returns Transition classification with source and confidence
 */
export async function classifyTransitionMessage(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
  userId?: string,
  ownership?: { chatId: string; actorId: string },
): Promise<TransitionClassification> {
  // Ownership guard: enforce chat participant when context is provided.
  if (ownership) {
    await requireChatParticipant(db, ownership.chatId, ownership.actorId,);
  } else if (userId !== undefined) {
    // Stand-alone classification: at minimum the userId must be a real actor
    // to prevent a forged id from reaching BYO apiKey resolution.
    await requireActorExists(db, userId,);
  }
  return classifyTransition(content, recentMessages, config, db, userId,);
}

// ─── Transition Creation ───────────────────────────────────────

/**
 * Create a chat transition event from a message.
 *
 * Pure constructor — no DB access, no ownership check required.
 * @param params - Transition parameters
 * @param params.actorId
 * @param params.narration
 * @param params.promotedMemoryIds
 * @param params.newLocationId
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
 * Pure function — no DB access, no ownership check required.
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
 * Ownership: the `actorId` MUST be a participant of `chatId` — otherwise
 * this throws `OwnershipError` and no rows are written to `actor_memories`.
 * This is the last line of defense against memory poisoning: a forged
 * `(actorId, chatId)` pair (cross-actor or non-participant) cannot
 * inject content into a victim's `actor_memories` table.
 * @param db - Kysely instance
 * @param params - Promotion parameters
 * @param params.messages
 * @param params.maxTokens
 * @param params.actorId
 * @param params.chatId
 * @param params.worldId
 * @param params.participantIds
 * @param params.promotionThreshold
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

  // Ownership guard: refuse to write into `actor_memories` for an actor
  // that is not a participant of this chat. Throws OwnershipError.
  await requireChatParticipant(db, chatId, actorId,);

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

//
