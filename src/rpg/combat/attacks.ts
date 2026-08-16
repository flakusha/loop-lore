// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type AdvantageMode, type DiceSides, rollDice, } from "../dice.js";
import { abilityModifier, proficiencyBonus, } from "../stats.js";
import {
  type AttackResult,
  type Combatant,
  DamageModifier,
  type DamageResistance,
  type DamageType,
} from "./types.js";

// ── Attack Rolls ────────────────────────────────────────

/**
 * Make an attack roll.
 *
 * @param attacker - The attacking combatant
 * @param target - The target combatant
 * @param attackAbility - Which ability to use ("str" for melee, "dex" for ranged)
 * @param damageDice - Weapon/spell damage dice (e.g. [8, 6] for 2d6)
 * @param damageSides - Sides on damage dice
 * @param damageType - Type of damage
 * @param extraDamage - Additional flat damage from features
 * @param resistances - Target's damage resistances
 * @param advantage - Advantage mode for the attack roll
 */
export function makeAttackRoll(
  attacker: Combatant,
  target: Combatant,
  attackAbility: "str" | "dex",
  damageDice: number,
  damageSides: DiceSides,
  damageType: DamageType = "physical",
  extraDamage = 0,
  resistances: DamageResistance[] = [],
  advantage: AdvantageMode = "normal",
): AttackResult {
  const abilityMod = abilityModifier(attacker.stats[attackAbility],);
  const profBonus = proficiencyBonus(attacker.level,);

  // Attack roll: d20 + ability mod + proficiency
  const attackRoll = rollDice(20, 1, abilityMod + profBonus, advantage,);
  const total = attackRoll.total;

  const criticalHit = attackRoll.natural20;
  const criticalMiss = attackRoll.natural1;
  const hit = criticalHit || (!criticalMiss && total >= target.ac);

  if (!hit) {
    return {
      roll: attackRoll,
      total,
      hit: false,
      criticalHit: false,
      criticalMiss,
      damage: null,
      narration: criticalMiss
        ? `${attacker.name} critically misses ${target.name}!`
        : `${attacker.name} misses ${target.name} (AC ${target.ac}).`,
    };
  }

  // Damage roll
  const actualDamageDice = damageDice * (criticalHit ? 2 : 1);
  const damageRoll = rollDice(damageSides, actualDamageDice,);

  const abilityDmgMod = abilityModifier(attacker.stats[attackAbility],);

  const totalBeforeResist = damageRoll.total + abilityDmgMod + extraDamage;

  // Apply resistances
  let finalDamage = totalBeforeResist;
  for (const res of resistances) {
    if (res.type === damageType) {
      switch (res.modifier) {
        case DamageModifier.Resistant: {
          finalDamage = Math.floor(finalDamage / 2,);
          break;
        }
        case DamageModifier.Vulnerable: {
          finalDamage *= 2;
          break;
        }
        case DamageModifier.Immune: {
          finalDamage = 0;
          break;
        }
      }
    }
  }

  finalDamage = Math.max(0, finalDamage,);

  const narration = criticalHit
    ? `${attacker.name} critically hits ${target.name} for ${finalDamage} ${damageType} damage!`
    : `${attacker.name} hits ${target.name} for ${finalDamage} ${damageType} damage.`;

  return {
    roll: attackRoll,
    total,
    hit: true,
    criticalHit,
    criticalMiss: false,
    damage: {
      baseDice: damageRoll,
      abilityMod: abilityDmgMod,
      flatBonus: extraDamage,
      totalBeforeResist,
      finalDamage,
      damageType,
      isCritical: criticalHit,
    },
    narration,
  };
}
