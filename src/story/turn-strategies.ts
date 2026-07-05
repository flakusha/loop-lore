/**
 * Turn Strategies
 *
 * Pure selection functions for each TurnStrategy variant.
 * Extracted from TurnManager to keep strategy logic testable and separable.
 */
import type { StoryContext } from "./story-types";

// ─── Strategy Function Signature ───────────────────────────────

export interface TurnParticipant {
  actorId: string;
  type: string;
  agentType: string;
}

export type TurnStrategyFn = (
  participants: TurnParticipant[],
  currentActorId: string | null,
  currentTurn: number,
  turnOrder: string[],
  context?: StoryContext,
) => string;

// ─── Strategies ────────────────────────────────────────────────

export const roundRobinSelect: TurnStrategyFn = (participants, currentActorId, _currentTurn, turnOrder) => {
  const lastIndex = currentActorId ? turnOrder.indexOf(currentActorId) : -1;
  const nextIndex = (lastIndex + 1) % participants.length;
  return participants[nextIndex].actorId;
};

export const sceneBasedSelect: TurnStrategyFn = (participants, currentActorId, currentTurn, turnOrder) => {
  // Weight narrators higher when scene context is needed
  // Pick narrator every 3rd turn, otherwise round-robin
  if (currentTurn % 3 === 0) {
    const narrator = participants.find((p) => p.agentType === "narrator");
    if (narrator) return narrator.actorId;
  }
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder);
};

export const initiativeSelect: TurnStrategyFn = (participants, _currentActorId, _currentTurn, _turnOrder) => {
  // Shuffle order based on "initiative" (random for MVP)
  // eslint-disable-next-line sonarjs/pseudo-random
  const shuffled = [...participants].toSorted(() => Math.random() - 0.5);
  return shuffled[0].actorId;
};

export const questDrivenSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  _context?: StoryContext,
) => {
  // Prioritize actors relevant to active quests (context would contain quest data)
  // Default to round-robin for MVP
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder);
};

export const hybridSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  context?: StoryContext,
) => {
  // Hybrid: scene-based fallback with quest awareness
  if (currentTurn % 5 === 0) {
    return questDrivenSelect(participants, currentActorId, currentTurn, turnOrder, context);
  }
  return sceneBasedSelect(participants, currentActorId, currentTurn, turnOrder);
};

// ─── Strategy Registry ─────────────────────────────────────────

import { TurnStrategy } from "../db/enums";
import type { TurnStrategy as TurnStrategyType } from "../db/enums";

export const STRATEGY_MAP: Record<TurnStrategyType, TurnStrategyFn> = {
  [TurnStrategy.RoundRobin]: roundRobinSelect,
  [TurnStrategy.SceneBased]: sceneBasedSelect,
  [TurnStrategy.Initiative]: initiativeSelect,
  [TurnStrategy.QuestDriven]: questDrivenSelect,
  [TurnStrategy.Hybrid]: hybridSelect,
};
