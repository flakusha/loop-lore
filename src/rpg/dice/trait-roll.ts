// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { abilityModifier, } from "../stats/modifiers.js";
import { type AbilityName, SKILL_ABILITY, type SkillName, type StatBlock, } from "../stats/types.js";
import { type GameplayTrait, type RollContextKind, } from "../traits/catalog.js";
import { rollDice, } from "./roll.js";
import { type AdvantageMode, type DiceRollResult, type DiceSides, } from "./types.js";

/** Roll context for trait application */
export interface TraitRollContext {
  readonly kind: RollContextKind;
  readonly ability?: AbilityName;
  readonly skill?: SkillName;
}

/** Resolved roll after trait composition */
export interface ResolvedRollContext {
  readonly abilityMod: number;
  readonly skillMod: number;
  readonly rollFloor: number;
  readonly proficiencyApplied: boolean;
  readonly sourceTraits: readonly string[];
}

/**
 * Highest roll_floor for the context across traits (stack rule: max wins).
 * @param context
 * @param traits
 * @param baseFloor
 * @returns {number}
 */
export function minimumRollValue(
  context: RollContextKind,
  traits: readonly GameplayTrait[],
  baseFloor = 1,
): number {
  let floor = baseFloor;
  for (const trait of traits) {
    for (const effect of trait.effects) {
      if (effect.kind === "roll_floor" && effect.context === context && effect.floor > floor) {
        floor = effect.floor;
      }
    }
  }

  return floor;
}

/**
 * Compose base ability modifier, trait effects, and skill linkage.
 * @param stats
 * @param traits
 * @param context
 * @returns {ResolvedRollContext}
 */
export function applyTraits(
  stats: StatBlock,
  traits: readonly GameplayTrait[],
  context?: TraitRollContext,
): ResolvedRollContext {
  const ability = context?.ability ?? (context?.skill !== undefined ? SKILL_ABILITY[context.skill] : undefined);
  let abilityMod = ability !== undefined ? abilityModifier(stats[ability],) : 0;
  let skillMod = 0;
  let proficiencyApplied = false;
  const sourceTraits: string[] = [];

  for (const trait of traits) {
    let touched = false;
    for (const effect of trait.effects) {
      if (effect.kind === "ability_bonus" && effect.ability === ability) {
        abilityMod += effect.bonus;
        touched = true;
      } else if (effect.kind === "skill_bonus" && effect.skill === context?.skill) {
        skillMod += effect.bonus;
        touched = true;
      } else if (effect.kind === "save_proficiency" && context?.kind === "save" && effect.ability === ability) {
        proficiencyApplied = true;
        touched = true;
      }
    }

    if (touched) {
      sourceTraits.push(trait.id,);
    }
  }

  return {
    abilityMod,
    skillMod,
    rollFloor: minimumRollValue(context?.kind ?? "check", traits,),
    proficiencyApplied,
    sourceTraits,
  };
}

/**
 * Roll with trait composition; floor lifts the raw d20, modifiers add on top.
 * @param stats
 * @param traits
 * @param context
 * @param sides
 * @param advantage
 * @returns {{ roll: DiceRollResult; resolved: ResolvedRollContext }}
 */
export function rollWithTraits(
  stats: StatBlock,
  traits: readonly GameplayTrait[],
  context: TraitRollContext,
  sides: DiceSides = 20,
  advantage: AdvantageMode = "normal",
): { roll: DiceRollResult; resolved: ResolvedRollContext } {
  const resolved = applyTraits(stats, traits, context,);
  const roll = rollDice(sides, 1, resolved.abilityMod + resolved.skillMod, advantage,);
  const [first,] = roll.dice;
  if (first !== undefined && first.value < resolved.rollFloor) {
    return {
      roll: {
        ...roll,
        dice: [{ ...first, value: resolved.rollFloor, },],
        rawTotal: resolved.rollFloor,
        total: resolved.rollFloor + roll.modifier,
      },
      resolved,
    };
  }

  return { roll, resolved, };
}
