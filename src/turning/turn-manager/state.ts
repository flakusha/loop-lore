// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";
import { TurnStrategy, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import type { TurnManagerState, } from "../types";
import { refreshTurnOrder, } from "./participants";
import { type TurnManagerHost, } from "./types";

/**
 * Number of retries for the optimistic story_state write. Each retry
 * re-reads the committed value and re-applies the caller's mutation, so
 * a concurrent writer only delays — never drops — the update.
 */
const PERSIST_RETRIES = 3;

/**
 * Serialize the current host.state to JSON.
 * @param state
 */
function serializeState(state: TurnManagerState,): ReturnType<typeof safeJsonStringify> {
  return safeJsonStringify(state,);
}

/** */
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

/**
 * Compare-and-swap write of host.state into chats.story_state.
 *
 * BUG-turn-state-blind-read-modify-write-lost-updates-on-concurren:
 * the previous implementation did a blind UPDATE (no WHERE on the prior
 * value), so two TurnManager instances for the same chat could overwrite
 * each other's currentTurn/turnOrder/pendingRegeneration. This version
 * re-reads the committed story_state, re-applies the caller's mutation on
 * top of the freshest committed copy, then writes WHERE id = chatId AND
 * story_state = <the value just read>. When the UPDATE touches zero rows,
 * another writer committed in between — we loop and re-apply, so a
 * concurrent writer only delays — never drops — the caller's operation.
 *
 * @param host
 * @param mutate - Mutation to apply to the freshest committed state. Runs
 *   once per retry against a FRESH state object (committed + strategy/
 *   maxTurns from the host), so it must be idempotent / side-effect-free
 *   except for state fields.
 */
export async function persistState(
  host: TurnManagerHost,
  mutate: (state: TurnManagerState,) => void | Promise<void>,
): Promise<void> {
  if (!host.state) { return; }

  for (let attempt = 0; attempt < PERSIST_RETRIES; attempt++) {
    // 1. Read the committed row so we can CAS on the exact stored string.
    const row = await host.db
      .selectFrom("chats",)
      .select(["story_state", "turn_strategy", "max_turns",],)
      .where("id", "=", host.chatId,)
      .executeTakeFirst();

    if (!row) {
      getLogger()
        .child({ module: "turn-manager", },)
        .error("persistState: chat not found", undefined, { chatId: host.chatId, },);
      return;
    }

    // 2. Rebase: start from the committed state (a concurrent writer's
    //    changes are the new baseline), keep the host's config columns
    //    (strategy/maxTurns are chat-level, not per-instance), then re-apply
    //    the caller's mutation on the fresh copy.
    const committedRaw = row.story_state;
    const committed = committedRaw ? jsonParseOr(committedRaw, createInitialState(),) : createInitialState();
    host.state = {
      ...committed,
      strategy: host.state.strategy,
      maxTurns: host.state.maxTurns,
    };
    if (host.state.turnOrder.length === 0) {
      await refreshTurnOrder(host,);
    }
    await mutate(host.state,);

    // 3. Serialize and CAS-write.
    const serialized = serializeState(host.state,);
    if (!serialized.ok) {
      getLogger()
        .child({ module: "turn-manager", },)
        .error("persistState serialization failed", undefined, { error: serialized.error, },);
      return;
    }

    const expected = committedRaw ?? null;
    const result = await sql<{ updated: number }>`
      update "chats"
      set "story_state" = ${serialized.value}
      where "id" = ${host.chatId}
        and ${expected === null ? sql`"story_state" is null` : sql`"story_state" = ${expected}`}
    `.execute(host.db,);

    // SQLite returns bigint numAffectedRows; Kysely sql result exposes it
    // via numAffectedRows, which we convert to a plain number.
    const affected = Number((result as unknown as { numAffectedRows: number | bigint }).numAffectedRows ?? 0,);
    if (affected > 0) { return; }

    // 4. Concurrent writer won the CAS race — loop and re-apply again.
    getLogger()
      .child({ module: "turn-manager", },)
      .debug("persistState CAS conflict, retrying", { chatId: host.chatId, attempt: attempt + 1, },);
  }

  // Surface instead of silently dropping: with no write, the caller's
  // mutation is lost on the next initialize(). A persistent conflict is a
  // programming error (a mutation that isn't re-appliable), not a runtime
  // condition the app should mask.
  throw new Error(`persistState: CAS conflict after ${PERSIST_RETRIES} retries (chat ${host.chatId})`,);
}

/**
 * Load or initialize turn manager state from the DB
 * @param host
 */
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
