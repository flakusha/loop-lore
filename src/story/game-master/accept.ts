// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Response Acceptance Dispatcher
 *
 * acceptResponse: evaluate, extract/apply events, decide escalation
 * or regeneration. humanOverride: apply a caller-provided decision.
 */
import { GameMasterType, } from "../../db/enums";
import { TurnStatus, turnStatusMachine, } from "../../db/enums-story/turns";
import { TransitionError, } from "../../db/state";
import { safeJsonStringify, } from "../../utils";
import { applyEvents, extractEvents, validateEvents, } from "../events";
import type { GameMasterDecision, } from "../types";
import { buildResult, } from "./decisions";
import type { GmState, GmTurnResult, } from "./types";

/**
 * Accept a response and process it through the full pipeline
 * @param state
 * @param turnId
 * @param response
 */
export async function acceptResponse(state: GmState, turnId: string, response: string,): Promise<GmTurnResult> {
  const turn = await state.db
    .selectFrom("story_turns",)
    .selectAll()
    .where("id", "=", turnId,)
    .executeTakeFirst();

  if (!turn) { throw new Error(`Turn ${turnId} not found`,); }

  const actor = await state.db
    .selectFrom("actors",)
    .select("display_name",)
    .where("id", "=", turn.actor_id,)
    .executeTakeFirst();

  const context = await state.worldState.buildContext(turn.chat_id,);

  const qualityEval = state.evaluator.evaluate({
    response,
    prompt: turn.prompt_sent,
    actorName: actor?.display_name ?? "unknown",
    context: context ?? undefined,
  },);

  const worldEvents = extractEvents({
    messageContent: response,
    actorId: turn.actor_id,
    currentLocationId: context?.world.currentLocation.id ?? null,
  },);

  if (context) {
    const validated = await validateEvents({ db: state.db, worldId: context.world.id, events: worldEvents, },);
    if (validated.valid) {
      await applyEvents({ db: state.db, worldId: context.world.id, events: validated.filteredEvents, },);
    }
  }

  let regenerationSuggested = false;
  let escalated = false;

  if (qualityEval.escalationReason) {
    escalated = true;
    if (state.config.type === GameMasterType.Hybrid || state.config.type === GameMasterType.Human) {
      return buildResult({
        turn,
        response,
        qualityEval,
        worldEvents,
        accepted: true,
        escalated: true,
        regenerationSuggested: false,
      },);
    }
  }

  if (qualityEval.regenerationReason) {
    const canRegen = await state.turnManager.requestRegeneration(turnId, qualityEval.regenerationReason,);
    regenerationSuggested = true;
    if (canRegen) {
      return buildResult({
        turn,
        response,
        qualityEval,
        worldEvents,
        accepted: false,
        escalated: false,
        regenerationSuggested: true,
      },);
    }
    escalated = true;
  }

  const accepted = !regenerationSuggested && !escalated;
  if (accepted) {
    if (!turnStatusMachine.canTransition(turn.status, TurnStatus.Accepted,)) {
      throw new TransitionError(turn.status, TurnStatus.Accepted,);
    }
    await state.db
      .updateTable("story_turns",)
      .set({
        response_received: response,
        quality_score: qualityEval.scores.overall,
        quality_details: (() => {
          const r = safeJsonStringify(qualityEval.details,);
          return r.ok ? r.value : "{}";
        })(),
        status: TurnStatus.Accepted,
        completed_at: new Date().toISOString(),
        world_events: (() => {
          const r = safeJsonStringify(worldEvents,);
          return r.ok ? r.value : "[]";
        })(),
      },)
      .where("id", "=", turnId,)
      .execute();

    await state.turnManager.recordTurn();
  }

  return buildResult({
    turn,
    response,
    qualityEval,
    worldEvents,
    accepted,
    escalated,
    regenerationSuggested,
  },);
}

/**
 * Human GM provides an override decision
 * @param state
 * @param _chatId
 * @param turnId
 * @param decision
 */
export async function humanOverride(
  state: GmState,
  _chatId: string,
  turnId: string,
  decision: GameMasterDecision,
): Promise<void> {
  const gmSerialized = safeJsonStringify(decision,);
  if (!gmSerialized.ok) { return; }

  const turn = await state.db
    .selectFrom("story_turns",)
    .select("status",)
    .where("id", "=", turnId,)
    .executeTakeFirst();
  if (!turn) { throw new Error(`Turn ${turnId} not found`,); }
  if (!turnStatusMachine.canTransition(turn.status, TurnStatus.Accepted,)) {
    throw new TransitionError(turn.status, TurnStatus.Accepted,);
  }

  await state.db
    .updateTable("story_turns",)
    .set({
      gm_decision: gmSerialized.value,
      status: TurnStatus.Accepted,
      completed_at: new Date().toISOString(),
    },)
    .where("id", "=", turnId,)
    .execute();
}
