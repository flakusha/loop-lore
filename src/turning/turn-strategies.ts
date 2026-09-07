// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import type { GroupTurnContext, TurnStrategyFn, } from "./types";

// ─── Strategy Registry ─────────────────────────────────────────

import { TurnStrategy, } from "../db/enums";
import type { TurnStrategy as TurnStrategyType, } from "../db/enums";

/**
 * Weighted random selection using talkativity scores.
 *
 * When a `skipActorId` is provided AND at least one other candidate exists,
 * the function filters out the skipped actor before weighting — this is
 * the consecutive-turn guard (BUG-group-cascade-consecutive-turn-guard).
 * @param participants
 * @param skipActorId
 */
function weightedRandomSelect(
  participants: { actorId: string; talkativity: number }[],
  skipActorId?: string | null,
): string {
  const filtered = skipActorId && participants.length > 1
    ? participants.filter((p,) => p.actorId !== skipActorId)
    : participants;
  if (filtered.length === 0) { return participants[0]!.actorId; }

  let totalWeight = 0;
  for (const p of filtered) { totalWeight += p.talkativity; }
  if (totalWeight <= 0) { return filtered[0]!.actorId; }

  let roll = Math.random() * totalWeight;
  for (const p of filtered) {
    roll -= p.talkativity;
    if (roll <= 0) { return p.actorId; }
  }
  return filtered[filtered.length - 1]!.actorId;
}

/**
 * Round-robin: deterministic cycle through participants
 * @param participants
 * @param currentActorId
 * @param _currentTurn
 * @param turnOrder
 */
export const roundRobinSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  _currentTurn,
  _turnOrder,
  _context,
  lastActorId,
) => {
  // Consecutive-turn guard (BUG-group-cascade-consecutive-turn-guard):
  // when the previous actor is present in `participants` AND alternatives
  // exist, treat the round-robin as "cycle from the previous speaker" so
  // the same actor isn't picked twice in a row.
  const candidate = lastActorId && participants.length > 1 && participants.some((p,) => p.actorId === lastActorId)
    ? participants.filter((p,) => p.actorId !== lastActorId)
    : participants;
  const lastIndex = currentActorId ? candidate.findIndex((p,) => p.actorId === currentActorId) : -1;
  const nextIndex = (lastIndex + 1) % candidate.length;
  return candidate[nextIndex]!.actorId;
};

export const sceneBasedSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  context,
  lastActorId,
) => {
  if (currentTurn % 3 === 0) {
    // Skip the narrator override when the narrator is the last speaker
    // AND alternatives exist (BUG-group-cascade-consecutive-turn-guard).
    const narrator = participants.find((p,) => p.agentType === "narrator");
    if (narrator && narrator.actorId !== lastActorId) { return narrator.actorId; }
  }
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder, context, lastActorId,);
};
export const initiativeSelect: TurnStrategyFn = (
  participants,
  _currentActorId,
  _currentTurn,
  _turnOrder,
  _context,
  lastActorId,
) => {
  // Consecutive-turn guard: skip the last speaker when alternatives exist
  // (BUG-group-cascade-consecutive-turn-guard).
  const hasInitiative = participants.some((p,) => (p as { initiativeScore?: number }).initiativeScore);
  if (hasInitiative) {
    const boosted = Array.from(participants, (p,) => ({
      actorId: p.actorId,
      talkativity: p.talkativity + ((p as { initiativeScore?: number }).initiativeScore ?? 0) * 3,
    }),);
    return weightedRandomSelect(boosted, lastActorId,);
  }
  return weightedRandomSelect(participants, lastActorId,);
};

/**
 * Quest-driven: round-robin for MVP (quest context plugs in later)
 * @param participants
 * @param currentActorId
 * @param currentTurn
 * @param turnOrder
 */
export const questDrivenSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  context,
  lastActorId,
) => {
  // Consecutive-turn guard (BUG-group-cascade-consecutive-turn-guard).
  return roundRobinSelect(participants, currentActorId, currentTurn, turnOrder, context, lastActorId,);
};

/**
 * Hybrid: scene-based with quest awareness every 5th turn.
 */
export const hybridSelect: TurnStrategyFn = (
  participants,
  currentActorId,
  currentTurn,
  turnOrder,
  context,
  lastActorId,
) => {
  // Group chat mode: use talkativity-weighted selection for liveliness
  const ctx = context as GroupTurnContext | undefined;
  if (ctx?.chatMode === "group") {
    // @mention override: if user mentioned someone, they get priority
    // (only honored when the mentioned actor isn't the previous speaker —
    // BUG-group-cascade-consecutive-turn-guard).
    if (ctx.mentionedActorId && ctx.mentionedActorId !== lastActorId) {
      const mentioned = participants.find((p,) => p.actorId === ctx.mentionedActorId);
      if (mentioned) { return mentioned.actorId; }
    }
    // Context-mention boost: actors mentioned in recent messages get a weight bump
    const boosted = Array.from(participants, (p,) => ({
      ...p,
      talkativity: p.talkativity + (ctx.recentActorIds?.includes(p.actorId,) ? 3 : 0),
    }),);
    return weightedRandomSelect(boosted, lastActorId,);
  }
  // Story mode: scene-based with quest triggers
  if (currentTurn % 5 === 0) {
    return questDrivenSelect(participants, currentActorId, currentTurn, turnOrder, context, lastActorId,);
  }
  return sceneBasedSelect(participants, currentActorId, currentTurn, turnOrder, context, lastActorId,);
};

export const STRATEGY_MAP: Record<TurnStrategyType, TurnStrategyFn> = {
  [TurnStrategy.RoundRobin]: roundRobinSelect,
  [TurnStrategy.SceneBased]: sceneBasedSelect,
  [TurnStrategy.Initiative]: initiativeSelect,
  [TurnStrategy.QuestDriven]: questDrivenSelect,
  [TurnStrategy.Hybrid]: hybridSelect,
};
