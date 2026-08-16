// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Status Effect (Shared: RPG, Magic, Disease, Social) ───────

/** Status effect type */
export type StatusEffectType =
  | "buff"
  | "debuff"
  | "dot" // damage over time
  | "hot" // heal over time
  | "control"
  | "special";

/** Status effect */
export interface StatusEffect {
  /** Effect ID */
  id: string;
  /** Effect name */
  name: string;
  /** Effect type */
  type: StatusEffectType;
  /** What stat is affected */
  affectedStat: string;
  /** Modifier value */
  value: number;
  /** Duration in turns */
  duration: number;
  /** Remaining turns */
  remainingTurns: number;
  /** Whether this effect can be dispelled */
  dispellable: boolean;
  /** Stack count (for stackable effects) */
  stackCount: number;
  /** Maximum stacks */
  maxStacks: number;
  /** Description */
  description: string;
}

/** Create a status effect */
export function createStatusEffect(
  name: string,
  type: StatusEffectType,
  affectedStat: string,
  value: number,
  duration: number,
  options: Partial<Omit<StatusEffect, "id" | "name" | "type" | "affectedStat" | "value" | "duration">> = {},
): StatusEffect {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    affectedStat,
    value,
    duration,
    remainingTurns: duration,
    dispellable: options.dispellable ?? true,
    stackCount: options.stackCount ?? 1,
    maxStacks: options.maxStacks ?? 1,
    description: options.description ?? `${name}: ${value} to ${affectedStat} for ${duration} turns`,
  };
}

/** Tick a status effect (reduce duration) */
export function tickStatusEffect(effect: StatusEffect,): StatusEffect | null {
  const remaining = effect.remainingTurns - 1;
  if (remaining <= 0) { return null; }
  return { ...effect, remainingTurns: remaining, };
}

/** Check if status effect is expired */
export function isStatusEffectExpired(effect: StatusEffect,): boolean {
  return effect.remainingTurns <= 0;
}
