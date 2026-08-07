import type {
  MoraleState,
} from "../integration-schemas";
import {
  applyMoraleModifier,
} from "../integration-schemas";
import type { SocialCombatResult, } from "./types";

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
