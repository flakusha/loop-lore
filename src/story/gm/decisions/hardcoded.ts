/**
 * Hardcoded fallback decision — no LLM call. Used when the LLM path throws
 * and as the no-provider baseline.
 */
import type { GmDecisionStrategy, } from "./types";

export const hardcodedDecision: GmDecisionStrategy = (deps, context, actorId,) => {
  const actor = context.actors.find((a,) => a.id === actorId);
  const npcState = actor?.npcState;
  const location = context.world.currentLocation;

  const promptParts: string[] = [`You are ${actor?.displayName ?? "unknown"}.`,];

  if (npcState) {
    promptParts.push(`Health: ${npcState.health}/100. Mental state: ${npcState.mental_state}.`,);
    if (npcState.inventory.length > 0) {
      const names = npcState.inventory.map(i => i.quantity > 1 ? `${i.name}×${i.quantity}` : i.name);
      promptParts.push(`Carrying: ${names.join(", ",)}.`,);
    }
  }

  const atmospherePart = location.atmosphere ? `Atmosphere: ${location.atmosphere}.` : "";
  promptParts.push(`Location: ${location.name}. ${atmospherePart}`,);

  if (context.activeQuests.length > 0) {
    const primary = context.activeQuests[0]!;
    promptParts.push(`Active quest: "${primary.name}" (${primary.progress}/${primary.target}).`,);
  }

  if (context.recentTurns.length > 0) {
    const last = context.recentTurns[context.recentTurns.length - 1]!;
    const lastActor = context.actors.find((a,) => a.id === last.actorId);
    promptParts.push(
      `Previous: ${lastActor?.displayName ?? "someone"} said/did: "${last.response?.slice(0, 200,)}"`,
    );
  }

  promptParts.push(
    `Respond in character. Use *action descriptions* for narration. Keep response 50-300 words.`,
  );

  const promptPartsFiltered: string[] = [];
  for (const p of promptParts) { if (p) { promptPartsFiltered.push(p,); } }

  return {
    nextActorId: actorId,
    turnPrompt: promptPartsFiltered.join("\n",),
    turnConstraints: {
      maxTokens: deps.config.llmConfig?.maxTokens ?? 800,
      tone: location.atmosphere ?? undefined,
    },
    questUpdates: [],
    worldStateChanges: [],
  };
};
