// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battles social actions: intimidate / taunt / negotiate / surrender.
 *
 * Thin surfacing layer over the implemented social-integration calculators
 * (`src/battle/social-integration`) — the formulas live there and are NOT
 * redefined here. Inputs come from the roster combatants and persisted
 * relationship standing; outcomes are logged and reported, never rolled or
 * re-balanced at this layer. Morale has no persisted store yet, so each
 * check starts from `createMoraleState`'s documented default (50).
 */

import {
  calculateIntimidationEffect,
  calculateSurrenderChance,
  calculateTauntEffect,
  createMoraleState,
  makeCombatSkillCheck,
  STANDARD_DC,
} from "../../../battle/index.js";
import { ActionType, type CombatAction, } from "../../../rpg/combat.js";
import { abilityModifier, } from "../../../rpg/stats.js";
import { clampReputation, } from "../../../schemas/reputation.js";
import { log, } from "../log.js";
import type { RpgServiceDeps, } from "../types.js";
import { persistBattle, requireActiveBattle, } from "./persistence.js";
import {
  BattleStatus,
  type ResolvedSocialAction,
  type SocialActionParams,
} from "./types.js";

/**
 * Perform a social combat action and persist its battle-log entry.
 * @param deps - Service dependencies
 * @param params - Battle, verb, acting combatant and target
 * @returns The surfaced calculator output (plus surrender chance when applicable)
 */
export async function performSocialAction(
  deps: RpgServiceDeps,
  params: SocialActionParams,
): Promise<ResolvedSocialAction> {
  const battle = await requireActiveBattle(deps, params.battleId,);

  const actor = battle.combatants.find((c,) => c.id === params.actorId);
  if (!actor) {
    throw new Error(`Actor ${params.actorId} is not in this battle.`,);
  }

  if (actor.hp <= 0) {
    throw new Error(`${actor.name} is defeated and cannot act.`,);
  }

  const target = battle.combatants.find((c,) => c.id === params.targetId);
  if (!target) {
    throw new Error(`Target ${params.targetId} is not in this battle.`,);
  }

  if (target.hp <= 0) {
    throw new Error(`${target.name} is already defeated.`,);
  }

  // No persisted morale store yet — checks start from the documented default.
  const morale = createMoraleState(target.id,);

  let success: boolean;
  let outcome: string;
  let surrenderChance: number | undefined;
  let canSurrender: boolean | undefined;

  switch (params.action) {
    case "intimidate": {
      const result = calculateIntimidationEffect(
        actor.level,
        actor.stats.cha,
        target.level,
        morale,
      );

      success = result.success;
      outcome = result.narrative;
      break;
    }

    case "taunt": {
      // Target personality has no battle-roster source yet; the calculator's
      // neutral baseline applies.
      const result = calculateTauntEffect(actor.stats.cha, morale, "neutral",);
      success = result.success;
      outcome = result.narrative;
      break;
    }

    case "negotiate": {
      // Charisma-based combat skill check against the standard medium DC.
      const check = makeCombatSkillCheck(
        abilityModifier(actor.stats.cha,),
        STANDARD_DC["medium"]!,
      );

      success = check.success;
      outcome = check.narration;
      break;
    }

    case "surrender": {
      // Reputation per the surrender calculator's convention: how the target
      // regards the acting side (relationship standing, clamped to ±100).
      const reputation = clampReputation(
        await targetStandingToward(deps, target.id, actor.id, battle.worldId,),
      );

      const chance = calculateSurrenderChance(
        morale,
        reputation,
        (target.hp / Math.max(1, target.maxHp,)) * 100,
      );

      success = chance.canSurrender;
      surrenderChance = chance.surrenderChance;
      canSurrender = chance.canSurrender;
      outcome = chance.canSurrender
        ? `${target.name} might surrender — ${chance.surrenderChance}% chance (reputation ${reputation}).`
        : `${target.name} refuses to surrender (morale too high or no viable chance).`;

      break;
    }
  }

  const action: CombatAction = {
    actorId: actor.id,
    type: ActionType.FreeAction,
    targetId: target.id,
    description: `${actor.name} (${params.action} → ${target.name}): ${outcome}`,
  };

  // Social actions surface calculator output; the roster itself is unchanged.
  await persistBattle(
    deps,
    battle.id,
    battle.round,
    battle.turnIndex,
    battle.combatants,
    [...battle.log, action,],
    BattleStatus.Active,
  );

  log().debug("Battle social action", {
    battleId: battle.id,
    action: params.action,
    success,
  },);

  return {
    action: params.action,
    actor,
    target,
    success,
    outcome,
    surrenderChance,
    canSurrender,
    combatants: battle.combatants,
    battleId: battle.id,
  };
}

/**
 * Read how `targetActorId` regards `actorId` (relationship standing).
 * Missing relationships read as neutral (0).
 * @param deps - Service dependencies
 * @param targetActorId - Actor whose view is read
 * @param actorId - Actor being regarded
 * @param worldId - Optional world scope
 */
async function targetStandingToward(
  deps: RpgServiceDeps,
  targetActorId: string,
  actorId: string,
  worldId: string | null,
): Promise<number> {
  let query = deps.database
    .selectFrom("character_relationships",)
    .select("standing",)
    .where("actor_id", "=", targetActorId,)
    .where("target_actor_id", "=", actorId,);

  if (worldId !== null) {
    query = query.where("world_id", "=", worldId,);
  }

  const row = await query.executeTakeFirst();
  return row?.standing ?? 0;
}
