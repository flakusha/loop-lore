// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battles Service — durable, per-chat RPG encounters.
 *
 * The pure combat engine (src/rpg/combat) resolves stateless `Combatant`
 * transitions; this service persists a battle's roster + round/turn state to
 * the `battles` table so an encounter survives across requests. `/battle`,
 * `/attack`, and `/heal` drive it.
 *
 * The `combatants` column holds a serialized `Combatant[]` and `log` holds a
 * `CombatAction[]` history — both JSON text (gm_config precedent). Every
 * mutating operation reads the row, applies a pure combat-engine transition,
 * and writes the updated roster back atomically.
 */
import {
  applyDamage,
  type AttackResult,
  type CombatAction,
  type Combatant,
  consumeAction,
  type DamageType,
  healCombatant,
  initCombatant,
  isCombatOver,
  makeAttackRoll,
  resetRoundReactions,
  resetTurnActions,
  rollInitiative,
  sortByInitiative,
} from "../../rpg/combat.js";
import type { DiceSides, } from "../../rpg/dice.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { jsonParseOr, safeJsonStringify, } from "../../utils.js";
import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

/** Battle lifecycle states. */
export const BattleStatus = {
  Active: "active",
  Completed: "completed",
  Abandoned: "abandoned",
} as const;
export type BattleStatus = (typeof BattleStatus)[keyof typeof BattleStatus];

/** A battle with its in-memory roster materialized from the persisted JSON. */
export interface BattleWithRoster {
  id: string;
  chatId: string;
  worldId: string | null;
  status: BattleStatus;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: CombatAction[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface StartBattleParams {
  chatId: string;
  worldId?: string | null;
  createdBy: string;
  combatants: Combatant[];
}

export interface AttackParams {
  battleId: string;
  attackerId: string;
  targetId: string;
  attackAbility: "str" | "dex";
  damageDice: number;
  damageSides: DiceSides;
  damageType?: DamageType;
  extraDamage?: number;
}

/** How an attack resolved, plus whether it ended the battle. */
export interface ResolvedAttack {
  /** The combat-engine attack result. */
  attack: AttackResult;
  /** Updated roster after the attack. */
  combatants: Combatant[];
  /** Battle completed as a side was defeated. */
  over: boolean;
  winner: "player" | "enemy" | null;
  /** Battlerow id when over (for matching). */
  battleId: string;
}

export interface HealParams {
  battleId: string;
  targetId: string;
  amount: number;
}

export interface ResolvedHeal {
  /** Updated combatant after healing. */
  combatant: Combatant;
  /** Full roster after healing. */
  combatants: Combatant[];
  /** Amount healed (clamped to max HP). */
  healed: number;
  battleId: string;
}

/**
 * Build a Combatant from an actor's persisted stats.
 *
 * @param actorId - Actor/character id
 * @param name - Display name
 * @param stats - Six-ability stat block
 * @param level - Character level
 * @param hp - Current HP (also used as max)
 * @param ac - Armor class
 * @param isNpc - Whether this is an NPC/enemy combatant
 * @returns A fresh in-combat Combatant
 */
export function buildCombatant(
  actorId: string,
  name: string,
  stats: StatBlock,
  level: number,
  hp: number,
  ac: number,
  isNpc: boolean,
): Combatant {
  return initCombatant(actorId, name, stats, level, hp, ac, isNpc,);
}

/**
 * Start an active battle for a chat.
 *
 * Rolls + sorts initiative for the roster at creation. Errors if an active
 * battle already exists for the chat — a chat hosts one encounter at a time.
 *
 * @param deps - Service dependencies (database)
 * @param params - Battle + roster to create
 * @returns The persisted battle with its materialized roster
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
 *
 * @param deps - Service dependencies
 * @param chatId - Chat to look up
 * @returns The active battle roster, or null when none active
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
 *
 * @param deps - Service dependencies
 * @param battleId - Battle id
 * @returns The battle roster, or null when not found
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
 *
 * @param deps - Service dependencies
 * @param params - Attack resolution parameters
 * @returns The resolved attack + updated roster + end-of-battle state
 */
export async function performAttack(
  deps: RpgServiceDeps,
  params: AttackParams,
): Promise<ResolvedAttack> {
  const battle = await requireActiveBattle(deps, params.battleId,);

  const attacker = battle.combatants.find((c,) => c.id === params.attackerId);
  const target = battle.combatants.find((c,) => c.id === params.targetId);
  if (!attacker) {
    throw new Error(`Attacker ${params.attackerId} is not in this battle.`,);
  }
  if (!target) {
    throw new Error(`Target ${params.targetId} is not in this battle.`,);
  }

  const attack = makeAttackRoll(
    attacker,
    target,
    params.attackAbility,
    params.damageDice,
    params.damageSides,
    params.damageType,
    params.extraDamage ?? 0,
  );

  const updated = Array.from(battle.combatants, (c,) => {
    const damaged = c.id === params.targetId && attack.hit && attack.damage
      ? applyDamage(c, attack.damage.finalDamage,).updated
      : c;
    return c.id === params.attackerId ? consumeAction(damaged, "attack",) : damaged;
  },);

  const action: CombatAction = {
    actorId: params.attackerId,
    type: "attack",
    targetId: params.targetId,
    description: attack.narration,
  };
  if (attack.hit && attack.damage) {
    action.damage = attack.damage.finalDamage;
    action.attack = attack;
  }

  // A battle only auto-resolves when it has an enemy side to defeat. All-ally
  // rosters (training/benefit duels) stay active until ended explicitly.
  const hasEnemy = updated.some((c,) => c.isNpc);
  const { over, winner, } = hasEnemy ? isCombatOver(updated,) : { over: false, winner: null, };

  await persistBattle(
    deps,
    battle.id,
    battle.round,
    battle.turnIndex,
    updated,
    [...battle.log, action,],
    over ? BattleStatus.Completed : BattleStatus.Active,
  );

  if (over) {
    log().info("Battle completed", { battleId: battle.id, winner, },);
  }

  return { attack, combatants: updated, over, winner, battleId: battle.id, };
}

/**
 * Heal a target combatant up to its max HP and persist the result.
 *
 * @param deps - Service dependencies
 * @param params - Heal resolution parameters
 * @returns The healed combatant + updated roster + amount healed
 */
export async function performHeal(
  deps: RpgServiceDeps,
  params: HealParams,
): Promise<ResolvedHeal> {
  const battle = await requireActiveBattle(deps, params.battleId,);

  const target = battle.combatants.find((c,) => c.id === params.targetId);
  if (!target) {
    throw new Error(`Target ${params.targetId} is not in this battle.`,);
  }

  const healedCombatant = healCombatant(target, params.amount,);
  const healed = healedCombatant.hp - target.hp;

  const updated = Array.from(battle.combatants, (c,) => (c.id === params.targetId ? healedCombatant : c),);

  const action: CombatAction = {
    actorId: params.targetId,
    type: "bonus_action",
    targetId: params.targetId,
    damage: healed,
    description: `${healedCombatant.name} recovers ${healed} HP.`,
  };

  await persistBattle(
    deps,
    battle.id,
    battle.round,
    battle.turnIndex,
    updated,
    [...battle.log, action,],
    BattleStatus.Active,
  );

  return { combatant: healedCombatant, combatants: updated, healed, battleId: battle.id, };
}

/**
 * Advance to the next turn; rolls over to a new round when the roster ends.
 *
 * Resets the acting combatant's turn actions each turn and every combatant's
 * reactions at the start of a round.
 *
 * @param deps - Service dependencies
 * @param battleId - Battle to advance
 * @returns The battle after advancement
 */
export async function advanceTurn(
  deps: RpgServiceDeps,
  battleId: string,
): Promise<BattleWithRoster> {
  const battle = await requireActiveBattle(deps, battleId,);
  const alive: Combatant[] = [];
  for (const c of battle.combatants) {
    if (c.hp > 0) { alive.push(c,); }
  }

  let nextTurn = battle.turnIndex + 1;
  let nextRound = battle.round;

  if (nextTurn >= alive.length) {
    nextTurn = 0;
    nextRound += 1;
  }

  // Reset the acting combatant's actions + reactions for the new turn.
  const acting = alive[nextTurn];
  const withTurnReset = acting
    ? Array.from(battle.combatants, (c,) => (c.id === acting.id ? resetTurnActions(c,) : c),)
    : battle.combatants;
  const updated = nextRound === battle.round ? withTurnReset : resetRoundReactions(withTurnReset,);

  await persistBattle(deps, battle.id, nextRound, nextTurn, updated, battle.log, BattleStatus.Active,);

  return { ...battle, round: nextRound, turnIndex: nextTurn, combatants: updated, };
}

/**
 * End a battle without a decisive winner.
 *
 * @param deps - Service dependencies
 * @param battleId - Battle to end
 * @param status - Terminal status (completed or abandoned)
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

// ── Helpers ────────────────────────────────────────────

/** Fetch an active battle or throw a descriptive error. */
async function requireActiveBattle(
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

/** Write an updated roster + log + round/turn back to the battles row. */
async function persistBattle(
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

interface BattleRow {
  id: string;
  chat_id: string;
  world_id: string | null;
  status: string;
  round: number;
  turn_index: number;
  combatants: string;
  log: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

/** Map a persisted battles row to a BattleWithRoster. */
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
