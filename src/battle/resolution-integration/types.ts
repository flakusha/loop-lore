import type { DiceRoll, } from "../integration-schemas";

/** Attack roll result */
export interface AttackRollResult {
  /** The dice roll */
  roll: DiceRoll;
  /** Whether attack hit */
  hit: boolean;
  /** Whether critical hit */
  criticalHit: boolean;
  /** Whether critical miss */
  criticalMiss: boolean;
  /** Damage dealt (if hit) */
  damage?: DamageResult;
  /** Narration */
  narration: string;
}

/** Damage result */
export interface DamageResult {
  /** Base damage */
  baseDamage: number;
  /** Damage modifiers */
  modifiers: { source: string; value: number }[];
  /** Total damage */
  totalDamage: number;
  /** Damage type */
  type: "physical" | "magical" | "fire" | "ice" | "lightning" | "poison" | "healing";
  /** Whether damage was critical */
  wasCritical: boolean;
}
