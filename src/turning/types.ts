/**
 * Turning Module — Shared Types
 *
 * Types for turn-based orchestration shared between
 * story mode (TurnManager) and group chat mode (GroupTurnSelector).
 */
import type { TurnStrategy, ChatMode } from "../db/enums";

// ─── Turn Participant ─────────────────────────────────────────

/** A participant eligible for turn selection */
export interface TurnParticipant {
  actorId: string;
  type: string;
  agentType: string;
  /** Per-chat participation weight (1-10, default 5) */
  talkativity: number;
}

// ─── Turn Manager State ───────────────────────────────────────

/** Persisted state for turn orchestration (stored in chats.story_state JSON) */
export interface TurnManagerState {
  currentTurn: number;
  currentActorId: string | null;
  turnOrder: string[];
  strategy: TurnStrategy;
  isPaused: boolean;
  lastTurnCompletedAt: string | null;
  maxTurns?: number;
  pendingRegeneration: {
    turnId: string;
    attempt: number;
    reason: string;
  } | null;
}

// ─── Group Chat Turn Context ──────────────────────────────────

/** Lightweight context for group-chat turn selection (no story/quest state) */
export interface GroupTurnContext {
  /** Chat mode: group (turn-based) or story (full orchestration) */
  chatMode: ChatMode;
  /** Whether generation is paused */
  isPaused: boolean;
  /** @mentioned actor ID from user's message, if any */
  mentionedActorId?: string;
  /** Recent message actor IDs for context-mention detection */
  recentActorIds?: string[];
}

// ─── Turn Strategy Function ───────────────────────────────────

/** Pure selection function signature for turn strategies */
export type TurnStrategyFn = (
  participants: TurnParticipant[],
  currentActorId: string | null,
  currentTurn: number,
  turnOrder: string[],
  context?: GroupTurnContext | Record<string, unknown>,
) => string;
