/**
 * Human-GM decision — emits a placeholder the human GM fills in.
 */
import type { GmDecisionStrategy } from "./types";

export const humanDecision: GmDecisionStrategy = (_deps, context, actorId) => {
  const actor = context.actors.find((a) => a.id === actorId);

  return {
    nextActorId: actorId,
    turnPrompt: `[Human GM] Select prompt for ${actor?.displayName ?? "actor"}...`,
    turnConstraints: { maxTokens: 800 },
    questUpdates: [],
    worldStateChanges: [],
  };
};
