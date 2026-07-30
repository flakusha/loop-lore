/**
 * Social Integration for Battle
 *
 * Intimidation, taunt, surrender, and morale mechanics.
 */
import type {
  MoraleState,
} from "./integration-schemas";
import {
  applyMoraleModifier,
} from "./integration-schemas";

/** Social combat action type */
export type SocialCombatAction =
  | "intimidate"
  | "taunt"
  | "negotiate"
  | "surrender"
  | "rally"
  | "inspire"
  | "demoralize";

/** Social combat action result */
export interface SocialCombatResult {
  /** Action performed */
  action: SocialCombatAction;
  /** Whether action succeeded */
  success: boolean;
  /** Margin of success/failure */
  margin: number;
  /** Effect on target morale */
  moraleEffect: number;
  /** New morale state of target */
  targetMorale: MoraleState;
  /** Narrative description */
  narrative: string;
}

/** Calculate intimidation effect */
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

/** Calculate taunt effect */
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

/** Calculate surrender chance */
export function calculateSurrenderChance(
  targetMorale: MoraleState,
  attackerReputation: number,
  targetHealthPercent: number,
): { surrenderChance: number; canSurrender: boolean } {
  // Can't surrender if morale is too high
  if (targetMorale.value > 30) {
    return { surrenderChance: 0, canSurrender: false, };
  }

  // Calculate surrender chance based on morale and health
  let chance = 0;

  // Low morale increases surrender chance
  chance += (30 - targetMorale.value) * 2;

  // Low health increases surrender chance
  chance += (100 - targetHealthPercent) * 0.5;

  // High attacker reputation increases surrender chance
  chance += attackerReputation * 0.3;

  // Cap at 90%
  chance = Math.min(90, Math.max(0, chance,),);

  return {
    surrenderChance: Math.round(chance,),
    canSurrender: true,
  };
}

/** Calculate rally effect */
export function calculateRallyEffect(
  leaderCharisma: number,
  leaderLevel: number,
  allyMorale: MoraleState,
): SocialCombatResult {
  const bonus = leaderCharisma + (leaderLevel * 2);
  const currentMorale = allyMorale.value;
  const maxMorale = 100;

  // Rally amount based on charisma and level
  const rallyAmount = Math.min(20, Math.floor(bonus / 5,),);

  // Can't rally above max
  const moraleEffect = Math.min(rallyAmount, maxMorale - currentMorale,);

  const newMorale = applyMoraleModifier(allyMorale, {
    reason: "rallied",
    value: moraleEffect,
    duration: 3,
    appliedAt: new Date().toISOString(),
  },);

  return {
    action: "rally",
    success: moraleEffect > 0,
    margin: moraleEffect,
    moraleEffect,
    targetMorale: newMorale,
    narrative: moraleEffect > 0
      ? `Rally successful! Ally morale increases by ${moraleEffect}.`
      : "Rally failed! Ally is already at peak morale.",
  };
}

/** Calculate inspire effect */
export function calculateInspireEffect(
  leaderCharisma: number,
  leaderInspiration: number,
  allyMorale: MoraleState,
): SocialCombatResult {
  const bonus = leaderCharisma + leaderInspiration;
  const currentMorale = allyMorale.value;

  // Inspire amount
  const inspireAmount = Math.min(25, Math.floor(bonus / 4,),);

  // Can't inspire above max
  const moraleEffect = Math.min(inspireAmount, 100 - currentMorale,);

  const newMorale = applyMoraleModifier(allyMorale, {
    reason: "inspired",
    value: moraleEffect,
    duration: 4,
    appliedAt: new Date().toISOString(),
  },);

  return {
    action: "inspire",
    success: moraleEffect > 0,
    margin: moraleEffect,
    moraleEffect,
    targetMorale: newMorale,
    narrative: moraleEffect > 0
      ? `Inspire successful! Ally morale increases by ${moraleEffect}.`
      : "Inspire failed! Ally is already inspired.",
  };
}

/** Calculate demoralize effect */
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

/** Process morale break */
export function processMoraleBreak(
  targetMorale: MoraleState,
): { broke: boolean; effects: string[] } {
  const effects: string[] = [];

  if (targetMorale.level === "broken") {
    effects.push("Target is panicking!", "Target may flee or surrender!", "Target suffers -20 to all rolls!",);
    return { broke: true, effects, };
  }

  if (targetMorale.level === "shaken") {
    effects.push("Target is shaken!", "Target suffers -10 to attack rolls!",);
    return { broke: false, effects, };
  }

  return { broke: false, effects, };
}
