/**
 * Turn Strategies — Pure Selection Functions
 *
 * Each strategy is a pure function: given participants + state, return the
 * selected actor ID. No side effects, no DB access — fully testable.
 *
 * Strategies support both story mode (full orchestration) and group chat mode
 * (lightweight turn selection). The context parameter carries mode-specific
 * data without coupling strategies to either use case.
 */
import type { TurnStrategyFn, GroupTurnContext } from "./types";

// ─── Strategy Registry ─────────────────────────────────────────

import { TurnStrategy } from "../db/enums";
import type { TurnStrategy as TurnStrategyType } from "../db/enums";

// ─── Helpers ───────────────────────────────────────────────────

/** Weighted random selection using talkativity scores */
function weightedRandomSelect(participants: { actorId: string; talkativity: number }[]): string {
  const totalWeight = participants.reduce((sum, p) => sum + p.talkativity, 0);
  if (totalWeight <= 0) return participants[0]!.actorId;

  let roll = Math.random() * totalWeight;
  for (const p of participants) {
    roll -= p.talkativity;
    if (roll <= 0) return p.actorId;
  }
  return participants[participants.length - 1]!.actorId;
}

// ─── Strategies ────────────────────────────────────────────────

/** Round-robin: deterministic cycle through participants */
export const roundRobinSelect: TurnStrategyFn = (participants, currentActorId, _currentTurn, turnOrder) => {
  const lastIndex = currentActorId ? turnOrder.indexOf(currentActorId) : -1;
  const nextIndex = (lastIndex + 1) % participants.length;
  return participants[nextIndex]!.actorId;
};

/** Scene-based: narrator every 3rd turn, otherwise round-robin */
export const sceneBasedSelect: TurnStrategyFn = (participants, currentActorId, currentTurn, turnOrder) => {
  if (currentTurn % 3 === 0) {
    const narrator = participants.find((p) => p.agentType === "narrator");
    if (narrator) return narrator.actorId;
  }
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder);
};

/** Initiative: weighted random based on talkativity + initiative score */
export const initiativeSelect: TurnStrategyFn = (participants) => {
  const hasInitiative = participants.some((p) => (p as { initiativeScore?: number }).initiativeScore);
  if (hasInitiative) {
    const boosted = participants.map((p) => ({
      actorId: p.actorId,
      talkativity: p.talkativity + ((p as { initiativeScore?: number }).initiativeScore ?? 0) * 3,
    }));
    return weightedRandomSelect(boosted);
  }
  return weightedRandomSelect(participants);
};

/** Quest-driven: round-robin for MVP (quest context plugs in later) */
export const questDrivenSelect: TurnStrategyFn = (participants, currentActorId, currentTurn, turnOrder) => {
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder);
};

/**
 * Hybrid: scene-based with quest awareness every 5th turn.
 *
 * In group chat mode, this degrades to talkativity-weighted selection
 * to keep conversations lively without GM orchestration.
 */
export const hybridSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  context,
) => {
  // Group chat mode: use talkativity-weighted selection for liveliness
  const ctx = context as GroupTurnContext | undefined;
  if (ctx?.chatMode === "group") {
    // @mention override: if user mentioned someone, they get priority
    if (ctx.mentionedActorId) {
      const mentioned = participants.find((p) => p.actorId === ctx.mentionedActorId);
      if (mentioned) return mentioned.actorId;
    }
    // Context-mention boost: actors mentioned in recent messages get a weight bump
    const boosted = participants.map((p) => ({
      ...p,
      talkativity: p.talkativity + (ctx.recentActorIds?.includes(p.actorId) ? 3 : 0),
    }));
    return weightedRandomSelect(boosted);
  }
  // Story mode: scene-based with quest triggers
  if (currentTurn % 5 === 0) {
    return questDrivenSelect(participants, currentActorId, currentTurn, turnOrder);
  }
  return sceneBasedSelect(participants, currentActorId, currentTurn, turnOrder);
};

export const STRATEGY_MAP: Record<TurnStrategyType, TurnStrategyFn> = {
  [TurnStrategy.RoundRobin]: roundRobinSelect,
  [TurnStrategy.SceneBased]: sceneBasedSelect,
  [TurnStrategy.Initiative]: initiativeSelect,
  [TurnStrategy.QuestDriven]: questDrivenSelect,
  [TurnStrategy.Hybrid]: hybridSelect,
};
