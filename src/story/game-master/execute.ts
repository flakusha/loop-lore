// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Turn Execution Dispatcher
 *
 * executeTurn: select an actor, produce a decision, record the turn.
 */
import { randomUUID, } from "node:crypto";
import { GameMasterType, WorldEventType, } from "../../db/enums";
import { processMovementTick, } from "../../rpg/npc-navigation/service/processing";
import type { WorldEvent, } from "../story-events-types";
import { getGmDecision, recordGmTurn, } from "./decisions";
import { injectNarration, } from "./narration";
import type { ExecuteTurnOptions, GmState, GmTurnResult, } from "./types";

/**
 * Execute one full story turn
 * @param state
 * @param debugActorId
 * @param options - `moveNpcs: false` for a caller that already moved the
 *   world this tick (the autonomy scheduler's movement dispatch).
 * @throws {Error}
 * @returns {Promise<GmTurnResult>}
 */
export async function executeTurn(
  state: GmState,
  debugActorId?: string,
  options: ExecuteTurnOptions = {},
): Promise<GmTurnResult> {
  const context = await state.worldState.buildContext(state.chatId,);
  if (!context) { throw new Error("No story context available",); }
  const gmDecision = await getGmDecision(state, context, debugActorId,);

  // Multi-assistant story rows: the GM decision carries a turn *prompt*,
  // not the reply. Run the selected actor in-character and publish it
  // as the turn response. Human/Hybrid modes keep `null` (the human
  // speaks through the chat input, never the LLM).
  let response: string | null = null;
  if (state.config.type === GameMasterType.Llm) {
    try {
      const actorModel = state.config.actorModels?.[gmDecision.nextActorId];
      const actor = context.actors.find((a,) => a.id === gmDecision.nextActorId);
      const text = await state.generateText({
        messages: [{ role: "user", content: gmDecision.turnPrompt, },],
        systemPrompt: actor?.systemPrompt ?? state.config.llmConfig?.systemPrompt ?? state.systemPromptDefault,
        provider: actorModel?.provider,
        model: actorModel?.model,
        maxTokens: gmDecision.turnConstraints?.maxTokens,
      },);

      response = text && text.trim() ? text : null;
    } catch {
      response = null;
    }
  }

  const turnId = randomUUID();
  // selectNextActor() increments currentTurn when debugActorId is not provided.
  // When debugActorId is provided, currentTurn is not incremented, so we add 1.
  const turnNumber = debugActorId ? state.turnManager.currentTurn + 1 : state.turnManager.currentTurn;

  if (gmDecision.narration && context.world.id !== "") {
    await injectNarration(state, context.world.id, gmDecision.narration,);
  }

  // Human-GM scene direction is broadcast to all participants as narration.
  if (state.gmGuidance?.sceneDescription && context.world.id !== "") {
    await injectNarration(state, context.world.id, state.gmGuidance.sceneDescription,);
  }

  await recordGmTurn(state, context, turnId, turnNumber, gmDecision,);

  // ── NPC autonomous movement tick ──────────────────────────
  // Advance NPCs based on their movement patterns (patrol, wander, follow, flee).
  // Movement results become world events the GM can reference in narration.
  //
  // Opt-out (`moveNpcs: false`) exists because movement is now a
  // first-class scheduler dispatch target: a tick that runs BOTH the
  // movement target and a GM beat would otherwise advance every NPC twice
  // per pass. The HTTP story-step route has no movement dispatch behind it,
  // so it keeps the default (`true`) and still moves NPCs exactly as before.
  const movementEvents: WorldEvent[] = [];
  if (options.moveNpcs !== false && context.world.id !== "") {
    const movementResults = await processMovementTick(state.db, context.world.id,);
    for (const r of movementResults) {
      if (r.success && r.toLocationId) {
        movementEvents.push({
          type: WorldEventType.LocationChange,
          actorId: r.actorId ?? undefined,
          locationId: r.toLocationId ?? undefined,
          timestamp: new Date().toISOString(),
          data: {
            fromLocationId: r.fromLocationId,
            toLocationId: r.toLocationId,
            pattern: r.pattern,
          },
          description: `NPC moved (${r.pattern}): ${r.fromLocationId} → ${r.toLocationId}`,
        },);
      }
    }
  }

  return {
    turnId,
    turnNumber,
    actorId: gmDecision.nextActorId,
    prompt: gmDecision.turnPrompt,
    response,
    qualityEvaluation: null,
    worldEvents: [...movementEvents,],
    gmDecision,
    accepted: false,
    escalated: false,
    regenerationSuggested: false,
    narration: gmDecision.narration ?? null,
  };
}
