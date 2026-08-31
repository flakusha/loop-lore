// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  MoraleState,
} from "../integration-schemas";
import {
  applyMoraleModifier,
} from "../integration-schemas";
import type { SocialCombatResult, } from "./types";

/**
 * Calculate intimidation effect
 * @param attackerLevel
 * @param attackerIntimidation
 * @param _targetLevel
 * @param targetMorale
 */
export function calculateIntimidationEffect(
  attackerLevel: number,
  attackerIntimidation: number,
  _targetLevel: number,
  targetMorale: MoraleState,
): SocialCombatResult {
  // Base intimidation check
  const attackerBonus = attackerIntimidation + (attackerLevel * 2);
  const targetResistance = 50 + (targetMorale.value * 0.5);
  const margin = attackerBonus - targetResistance;

  const success = margin > 0;
  const moraleEffect = success ? -Math.min(30, Math.abs(margin,) / 2,) : 0;

  const newMorale = success
    ? applyMoraleModifier(targetMorale, {
      reason: "intimidated",
      value: moraleEffect,
      duration: 3,
      appliedAt: new Date().toISOString(),
    },)
    : targetMorale;

  return {
    action: "intimidate",
    success,
    margin,
    moraleEffect,
    targetMorale: newMorale,
    narrative: success
      ? `Intimidation successful! Target's morale drops by ${Math.abs(moraleEffect,)}.`
      : "Intimidation failed! Target stands firm.",
  };
}

/**
 * Calculate taunt effect
 * @param attackerCharisma
 * @param targetMorale
 * @param targetPersonality
 */
export function calculateTauntEffect(
  attackerCharisma: number,
  targetMorale: MoraleState,
  targetPersonality: "aggressive" | "cautious" | "neutral",
): SocialCombatResult {
  let bonus = attackerCharisma;
  let targetResistance = 50;

  // Personality affects resistance
  switch (targetPersonality) {
    case "aggressive": {
      bonus += 10; // Easier to taunt aggressive targets
      targetResistance -= 10;
      break;
    }
    case "cautious": {
      bonus -= 10; // Harder to taunt cautious targets
      targetResistance += 10;
      break;
    }
    case "neutral": {
      // Balanced disposition — baseline resistance.
      break;
    }
  }

  const margin = bonus - targetResistance;
  const success = margin > 0;

  // Taunt can backfire on low morale targets
  let moraleEffect = 0;
  if (success) {
    moraleEffect = -15; // Target becomes reckless
  } else if (targetMorale.value < 30) {
    moraleEffect = 5; // Low morale target gains confidence from taunt
  }

  const newMorale = applyMoraleModifier(targetMorale, {
    reason: "taunted",
    value: moraleEffect,
    duration: 2,
    appliedAt: new Date().toISOString(),
  },);

  return {
    action: "taunt",
    success,
    margin,
    moraleEffect,
    targetMorale: newMorale,
    narrative: success
      ? "Taunt successful! Target becomes reckless."
      : "Taunt failed! Target remains composed.",
  };
}

/**
 * Calculate demoralize effect
 * @param attackerIntimidation
 * @param attackerLevel
 * @param targetMorale
 */
export function calculateDemoralizeEffect(
  attackerIntimidation: number,
  attackerLevel: number,
  targetMorale: MoraleState,
): SocialCombatResult {
  const bonus = attackerIntimidation + (attackerLevel * 2);
  const targetResistance = 50 + (targetMorale.value * 0.3);

  const margin = bonus - targetResistance;
  const success = margin > 0;

  const moraleEffect = success ? -Math.min(25, Math.abs(margin,) / 2,) : 0;

  const newMorale = success
    ? applyMoraleModifier(targetMorale, {
      reason: "demoralized",
      value: moraleEffect,
      duration: 4,
      appliedAt: new Date().toISOString(),
    },)
    : targetMorale;

  return {
    action: "demoralize",
    success,
    margin,
    moraleEffect,
    targetMorale: newMorale,
    narrative: success
      ? `Demoralize successful! Target's morale drops by ${Math.abs(moraleEffect,)}.`
      : "Demoralize failed! Target remains steadfast.",
  };
}
