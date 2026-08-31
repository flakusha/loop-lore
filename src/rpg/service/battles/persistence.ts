// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Battles persistence layer: DB reads/writes + roster materialization. */

import type { CombatAction, Combatant, } from "../../../rpg/combat.js";
import { jsonParseOr, safeJsonStringify, } from "../../../utils.js";
import { log, } from "../log.js";
import type { RpgServiceDeps, } from "../types.js";
import {
  type BattleRow,
  BattleStatus,
  type BattleWithRoster,
} from "./types.js";
/**
 * @param deps
 * @param chatId
 */
export async function getActiveBattle(
  deps: RpgServiceDeps,
  chatId: string,
): Promise<BattleWithRoster | null> {
  const row = await deps.database
    .selectFrom("battles",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .where("status", "=", BattleStatus.Active,)
    .executeTakeFirst();

  return row ? materialize(row,) : null;
}

/**
 * Fetch a battle by id.
 * @param deps - Service dependencies
 * @param battleId - Battle id
 * @returns The battle roster, or null when not found
 */

/**
 * @param deps
 * @param battleId
 */
export async function getBattle(
  deps: RpgServiceDeps,
  battleId: string,
): Promise<BattleWithRoster | null> {
  const row = await deps.database
    .selectFrom("battles",)
    .selectAll()
    .where("id", "=", battleId,)
    .executeTakeFirst();

  return row ? materialize(row,) : null;
}

/**
 * Resolve an attack against a target combatant and persist the result.
 *
 * Rolls attack + damage via the combat engine, applies damage to the target,
 * consumes the attacker's action, and saves the roster. A battle ends
 * automatically when one side is fully defeated.
 * @param deps - Service dependencies
 * @param params - Attack resolution parameters
 * @returns The resolved attack + updated roster + end-of-battle state
 */

/**
 * @param deps
 * @param battleId
 */
export async function requireActiveBattle(
  deps: RpgServiceDeps,
  battleId: string,
): Promise<BattleWithRoster> {
  const battle = await getBattle(deps, battleId,);
  if (!battle) {
    throw new Error(`Battle ${battleId} not found.`,);
  }
  if (battle.status !== BattleStatus.Active) {
    throw new Error(`Battle ${battleId} is ${battle.status}, not active.`,);
  }
  return battle;
}

/**
 * @param deps
 * @param battleId
 * @param round
 * @param turnIndex
 * @param combatants
 * @param logEntries
 * @param status
 */
export async function persistBattle(
  deps: RpgServiceDeps,
  battleId: string,
  round: number,
  turnIndex: number,
  combatants: Combatant[],
  logEntries: CombatAction[],
  status: BattleStatus,
): Promise<void> {
  const serializedRoster = safeJsonStringify(combatants,);
  if (!serializedRoster.ok) {
    throw new Error(`Failed to serialize roster: ${serializedRoster.error.message}`,);
  }
  const serializedLog = safeJsonStringify(logEntries,);
  if (!serializedLog.ok) {
    throw new Error(`Failed to serialize log: ${serializedLog.error.message}`,);
  }
  const endedAt = status === BattleStatus.Active ? null : new Date().toISOString();

  await deps.database
    .updateTable("battles",)
    .set({
      round,
      turn_index: turnIndex,
      combatants: serializedRoster.value,
      log: serializedLog.value,
      status,
      ended_at: endedAt,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", battleId,)
    .execute();
}

/**
 * Map a persisted battles row to a BattleWithRoster.
 * @param row
 */
function materialize(row: BattleRow,): BattleWithRoster {
  const parsedRoster = jsonParseOr<Combatant[]>(row.combatants, [],);
  if (!Array.isArray(parsedRoster,)) {
    log().warn("Battle roster is not an array; defaulting to empty", { battleId: row.id, },);
  }
  const parsedLog = jsonParseOr<CombatAction[]>(row.log, [],);
  if (!Array.isArray(parsedLog,)) {
    log().warn("Battle log is not an array; defaulting to empty", { battleId: row.id, },);
  }

  return {
    id: row.id,
    chatId: row.chat_id,
    worldId: row.world_id,
    status: row.status as BattleStatus,
    round: row.round,
    turnIndex: row.turn_index,
    combatants: Array.isArray(parsedRoster,) ? parsedRoster : [],
    log: Array.isArray(parsedLog,) ? parsedLog : [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
  };
}
