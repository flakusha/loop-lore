// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Battles combat actions: attack, heal, turn advancement. */

import {
  applyDamage,
  type CombatAction,
  type Combatant,
  consumeAction,
  healCombatant,
  isCombatOver,
  makeAttackRoll,
  resetRoundReactions,
  resetTurnActions,
} from "../../../rpg/combat.js";
import { log, } from "../log.js";
import type { RpgServiceDeps, } from "../types.js";
import { persistBattle, requireActiveBattle, } from "./persistence.js";
import type { AttackParams, BattleWithRoster, HealParams, ResolvedAttack, ResolvedHeal, } from "./types.js";
import { BattleStatus, } from "./types.js";
/**
 * @param deps
 * @param params
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
 * @param deps - Service dependencies
 * @param params - Heal resolution parameters
 * @returns The healed combatant + updated roster + amount healed
 */

/**
 * @param deps
 * @param params
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
 * @param deps - Service dependencies
 * @param battleId - Battle to advance
 * @returns The battle after advancement
 */

/**
 * @param deps
 * @param battleId
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
 * @param deps - Service dependencies
 * @param battleId - Battle to end
 * @param status - Terminal status (completed or abandoned)
 */
