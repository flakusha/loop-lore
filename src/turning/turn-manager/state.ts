// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { TurnStrategy, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import type { TurnManagerState, } from "../types";
import { refreshTurnOrder, } from "./participants";
import type { TurnManagerHost, } from "./types";

export function createInitialState(): TurnManagerState {
  return {
    currentTurn: 0,
    currentActorId: null,
    turnOrder: [],
    strategy: TurnStrategy.Hybrid,
    isPaused: false,
    lastTurnCompletedAt: null,
    pendingRegeneration: null,
  };
}

export async function persistState(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { return; }
  const serialized = safeJsonStringify(host.state,);
  if (!serialized.ok) {
    getLogger()
      .child({ module: "turn-manager", },)
      .error("persistState serialization failed", undefined, { error: serialized.error, },);
    return;
  }
  await host.db
    .updateTable("chats",)
    .set({ story_state: serialized.value, },)
    .where("id", "=", host.chatId,)
    .execute();
}

/** Load or initialize turn manager state from the DB */
export async function initializeTurnManager(host: TurnManagerHost,): Promise<void> {
  const chat = await host.db
    .selectFrom("chats",)
    .select(["story_state", "turn_strategy", "max_turns",],)
    .where("id", "=", host.chatId,)
    .executeTakeFirst();

  if (!chat) {
    throw new Error(`Chat ${host.chatId} not found`,);
  }

  host.state = chat.story_state
    ? jsonParseOr(chat.story_state, createInitialState(),)
    : createInitialState();

  if (chat.turn_strategy) {
    host.state.strategy = chat.turn_strategy;
  }

  if (chat.max_turns != null) {
    host.state.maxTurns = chat.max_turns;
  }

  if (host.state.turnOrder.length === 0) {
    await refreshTurnOrder(host,);
  }
}
