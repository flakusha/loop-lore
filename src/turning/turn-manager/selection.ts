// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { TurnStrategy, } from "../../db/enums";
import type { TurnStrategy as TurnStrategyType, } from "../../db/enums";
import { fetchSkipCooldowns, } from "../skip-cooldown";
import { STRATEGY_MAP, } from "../turn-strategies";
import type { GroupTurnContext, } from "../types";
import { fetchTurnParticipants, } from "./participants";
import { persistState, } from "./state";
import type { TurnManagerHost, } from "./types";

/**
 * Select the next actor to act.
 * @param host
 * @param strategy - Override strategy (default: state.strategy)
 * @param context - Turn context (@mentions, recent actors, chat mode, or story context)
 * @returns Selected actor ID, or null if no participants
 * @throws {Error}
 */
export async function selectNextActor(
  host: TurnManagerHost,
  strategy?: TurnStrategyType,
  context?: GroupTurnContext | Record<string, unknown>,
): Promise<string | null> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }

  const resolvedStrategy = strategy ?? host.state.strategy;
  const mode = context?.chatMode === "group" ? "group" : "story";
  const selectFn = STRATEGY_MAP[resolvedStrategy];
  let selectedId: string | null = null;
  let noParticipants = false;
  await persistState(host, async (state,) => {
    // Recompute candidates inside the closure so a CAS retry re-reads a
    // fresh participant/cooling snapshot instead of a stale capture.
    const participants = await fetchTurnParticipants(host, mode,);
    if (participants.length === 0) {
      noParticipants = true;
      return;
    }

    const cooling = await fetchSkipCooldowns(host.db, host.chatId,);
    const eligible = participants.filter((p,) => !cooling.has(p.actorId,));
    const candidates = eligible.length > 0 ? eligible : participants;

    state.currentTurn = state.currentTurn + 1;
    selectedId = selectFn(
      candidates,
      state.currentActorId,
      state.currentTurn,
      state.turnOrder,
      context,
      state.currentActorId,
    );

    state.currentActorId = selectedId;
  },);

  if (noParticipants) { return null; }
  return selectedId;
}

/**
 * Record a completed turn (persists state)
 * @param host
 * @throws {Error}
 * @returns {Promise<void>}
 */
export async function recordTurn(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  const completedAt = new Date().toISOString();
  host.state.lastTurnCompletedAt = completedAt;
  // Initiative strategy: spending a turn consumes one initiative point, so an
  // actor can't dominate every turn (docs/frontend/chat/group-chat.md Step 2).
  if (host.state.strategy === TurnStrategy.Initiative && host.state.currentActorId) {
    await decrementInitiative(host, host.state.currentActorId,);
  }

  await persistState(host, (state,) => {
    state.lastTurnCompletedAt = completedAt;
  },);
}

/**
 * Decrement the active actor's initiative score for the current scene (min 0).
 * @param host
 * @param actorId
 */
async function decrementInitiative(host: TurnManagerHost, actorId: string,): Promise<void> {
  const currentScene = host.state?.currentSceneId ?? "main";
  const current = await host.db
    .selectFrom("group_initiatives",)
    .select("score",)
    .where("chat_id", "=", host.chatId,)
    .where("scene_id", "=", currentScene,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  const nextScore = Math.max(0, (current?.score ?? 1) - 1,);
  if (current) {
    await host.db
      .updateTable("group_initiatives",)
      .set({ score: nextScore, updated_at: new Date().toISOString(), },)
      .where("chat_id", "=", host.chatId,)
      .where("scene_id", "=", currentScene,)
      .where("actor_id", "=", actorId,)
      .where("score", "=", current.score,)
      .execute();
  } else {
    // No row yet (default 1) — create with the decremented value so future
    // selections see a floor of 0 instead of the default.
    await host.db
      .insertInto("group_initiatives",)
      .values({
        chat_id: host.chatId,
        scene_id: currentScene,
        actor_id: actorId,
        score: 0,
      },)
      .onConflict((oc,) => oc.columns(["chat_id", "scene_id", "actor_id",],).doNothing())
      .execute();
  }
}
