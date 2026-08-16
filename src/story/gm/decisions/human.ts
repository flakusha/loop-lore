// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Human-GM decision — emits a placeholder the human GM fills in.
 */
import type { GmDecisionStrategy, } from "./types";

export const humanDecision: GmDecisionStrategy = (deps, context, actorId,) => {
  const actor = context.actors.find((a,) => a.id === actorId);

  const promptParts = [`[Human GM] Select prompt for ${actor?.displayName ?? "actor"}...`,];
  if (deps.gmGuidance?.constraints?.length) {
    promptParts.push(`GM guidance — constraints: ${deps.gmGuidance.constraints.join("; ",)}`,);
  }
  if (deps.gmGuidance?.sceneDescription) {
    promptParts.push(`GM scene direction: ${deps.gmGuidance.sceneDescription}`,);
  }

  return {
    nextActorId: actorId,
    turnPrompt: promptParts.join("\n",),
    turnConstraints: { maxTokens: 800, },
    questUpdates: [],
    worldStateChanges: [],
  };
};
