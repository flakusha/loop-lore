// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Battles service types + combatant builder. */

import {
  type AttackResult,
  type CombatAction,
  type Combatant,
  type DamageType,
  initCombatant,
} from "../../../rpg/combat.js";
import type { DiceSides, } from "../../../rpg/dice.js";
import type { StatBlock, } from "../../../rpg/stats.js";
/** Battle lifecycle states. */
export const BattleStatus = {
  Active: "active",
  Completed: "completed",
  Abandoned: "abandoned",
} as const;
/** */
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

/** */
export interface StartBattleParams {
  chatId: string;
  worldId?: string | null;
  createdBy: string;
  combatants: Combatant[];
}

/** */
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

/** */
export interface HealParams {
  battleId: string;
  targetId: string;
  amount: number;
}

/** */
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

/** Raw persisted battles row. */
export interface BattleRow {
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
