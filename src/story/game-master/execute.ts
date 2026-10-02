// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Turn Execution Dispatcher
 *
 * executeTurn: select an actor, produce a decision, record the turn.
 */
import { randomUUID, } from "node:crypto";
import { WorldEventType, } from "../../db/enums";
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
  if (options.moveNpcs !== false) {
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
    response: null,
    qualityEvaluation: null,
    worldEvents: [...movementEvents,],
    gmDecision,
    accepted: false,
    escalated: false,
    regenerationSuggested: false,
    narration: gmDecision.narration ?? null,
  };
}
