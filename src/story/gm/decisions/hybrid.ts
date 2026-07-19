/**
 * Hybrid decision — LLM base, then nudges constraints when the scene is
 * crowded (many quests or actors).
 */
import { llmDecision, } from "./llm";
import type { GmDecisionStrategy, } from "./types";

export const hybridDecision: GmDecisionStrategy = async (deps, context, actorId,) => {
  const decision = await llmDecision(deps, context, actorId,);

  const questCount = context.activeQuests.length;
  const actorCount = context.actors.length;

  if (questCount > 5 || actorCount > 8) {
    decision.turnConstraints.focus = "Keep it simple — complex scene";
  }

  return decision;
};
