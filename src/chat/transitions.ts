/**
 * Chat Transitions
 *
 * Handles context transitions during chat: scene changes,
 * context cuts with memory promotion, and location changes.
 *
 * This module computes transition metadata — the actual message
 * archiving and memory promotion are handled by the message routes.
 */
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
    /\b(i|we|you)\s+(walk|move|go|travel|head|enter|leave|exit)\b/i,
    /\b(scene|setting|location)\s+(shifts?|changes?|moves?|transitions?)\b/i,
    /\b(let'?s?\s+go\s+to|heading\s+to|arriving?\s+at)\b/i,
    /\b(after\s+(a\s+)?(while|moment|few\s+minutes|long\s+journey))\b/i,
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
  if (/\b(context\s*cut|skip\s*(ahead|forward|time))\b/i.test(lower,)) { return "context_cut"; }
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
