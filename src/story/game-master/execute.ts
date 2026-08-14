/**
 * Game Master Service — Turn Execution Dispatcher
 *
 * executeTurn: select an actor, produce a decision, record the turn.
 */
import { randomUUID, } from "node:crypto";
import { getGmDecision, recordGmTurn, } from "./decisions";
import { injectNarration, } from "./narration";
import type { GmState, GmTurnResult, } from "./types";

/** Execute one full story turn */
export async function executeTurn(state: GmState, debugActorId?: string,): Promise<GmTurnResult> {
  const context = await state.worldState.buildContext(state.chatId,);
  if (!context) { throw new Error("No story context available",); }

  const gmDecision = await getGmDecision(state, context, debugActorId,);
  const turnId = randomUUID();
  // selectNextActor() increments currentTurn when debugActorId is not provided.
  // When debugActorId is provided, currentTurn is not incremented, so we add 1.
  const turnNumber = debugActorId ? state.turnManager.currentTurn + 1 : state.turnManager.currentTurn;

  if (gmDecision.narration) {
    await injectNarration(state, context.world.id, gmDecision.narration,);
  }

  // Human-GM scene direction is broadcast to all participants as narration.
  if (state.gmGuidance?.sceneDescription) {
    await injectNarration(state, context.world.id, state.gmGuidance.sceneDescription,);
  }

  await recordGmTurn(state, context, turnId, turnNumber, gmDecision,);

  return {
    turnId,
    turnNumber,
    actorId: gmDecision.nextActorId,
    prompt: gmDecision.turnPrompt,
    response: null,
    qualityEvaluation: null,
    worldEvents: [],
    gmDecision,
    accepted: false,
    escalated: false,
    regenerationSuggested: false,
    narration: gmDecision.narration ?? null,
  };
}
