// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battles Service — durable, per-chat RPG encounters.
 *
 * Split across:
 * - `types.ts` — battle types, `BattleStatus`, `buildCombatant`
 * - `persistence.ts` — DB reads/writes + roster materialization
 * - `actions.ts` — combat actions (attack/heal/turn advancement)
 *
 * This barrel re-exports the full public API; importers use
 * `src/rpg/service/battles` unchanged.
 */
import {
  rollInitiative,
  sortByInitiative,
} from "../../rpg/combat.js";
import { safeJsonStringify, } from "../../utils.js";
import { getActiveBattle, getBattle, } from "./battles/persistence.js";
import { BattleStatus, type BattleWithRoster, type StartBattleParams, } from "./battles/types.js";
import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

export * from "./battles/actions.js";
export * from "./battles/persistence.js";
export * from "./battles/types.js";
/**
 * @param deps
 * @param params
 */
export async function startBattle(
  deps: RpgServiceDeps,
  params: StartBattleParams,
): Promise<BattleWithRoster> {
  const existing = await getActiveBattle(deps, params.chatId,);
  if (existing) {
    throw new Error(`An active battle already exists in this chat (${existing.id}).`,);
  }

  const withInitiative = Array.from(params.combatants, (c,) => ({
    ...c,
    initiative: rollInitiative(c,).total,
  }),);
  const sorted = sortByInitiative(withInitiative,);
  const serialized = safeJsonStringify(sorted,);
  if (!serialized.ok) {
    throw new Error(`Failed to serialize battle roster: ${serialized.error.message}`,);
  }

  const id = crypto.randomUUID();
  await deps.database
    .insertInto("battles",)
    .values({
      id,
      chat_id: params.chatId,
      world_id: params.worldId ?? null,
      status: BattleStatus.Active,
      round: 1,
      turn_index: 0,
      combatants: serialized.value,
      log: "[]",
      created_by: params.createdBy,
    },)
    .execute();

  log().debug("Started battle", { id, chatId: params.chatId, },);
  return {
    id,
    chatId: params.chatId,
    worldId: params.worldId ?? null,
    status: BattleStatus.Active,
    round: 1,
    turnIndex: 0,
    combatants: sorted,
    log: [],
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endedAt: null,
  };
}

/**
 * Fetch an active battle for a chat.
 * @param deps - Service dependencies
 * @param chatId - Chat to look up
 * @returns The active battle roster, or null when none active
 */

/**
 * @param deps
 * @param battleId
 * @param status
 */
export async function endBattle(
  deps: RpgServiceDeps,
  battleId: string,
  status: Exclude<BattleStatus, "active">,
): Promise<void> {
  const battle = await getBattle(deps, battleId,);
  if (!battle) {
    throw new Error(`Battle ${battleId} not found.`,);
  }

  await deps.database
    .updateTable("battles",)
    .set({ status, ended_at: new Date().toISOString(), updated_at: new Date().toISOString(), },)
    .where("id", "=", battleId,)
    .execute();

  log().debug("Ended battle", { battleId, status, },);
}
