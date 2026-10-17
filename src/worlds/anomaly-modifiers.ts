// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/anomaly-modifiers.ts — pure anomaly effect merging
 *
 * No Kysely, no clock, no I/O: everything here is a function of its
 * arguments, so the balance rules can be unit-tested without a database
 * and the same code runs in the scheduler and in the prompt builder.
 *
 * MERGE RULE. Sums and multiplies are DIFFERENT on purpose:
 *   - `stats` and the two over-time scalars ADD. Two anomalies each
 *     granting 2 strength grant 4, and a 3/s poison stacks with a
 *     -1/s regeneration to a net 2/s rather than cancelling to zero.
 *   - the two MULTIPLIERS multiply. Two 1.5x XP anomalies grant 2.25x,
 *     which is what a rich place should mean; adding them to 3x would
 *     let an unbounded pile-up make XP trivially fast.
 *
 * `baseModifiers` seeds the sum, so a caller folds existing world bonuses
 * into the same pass instead of running a second merge step.
 */
import { jsonParseOr, parseJsonList, } from "../utils";
import type { Anomaly, AnomalyModifiers, StatModifiers, } from "./anomaly-types";

/** Neutral modifiers: no deltas, unit multipliers. */
export function neutralModifiers(): AnomalyModifiers {
  return {
    stats: {},
    damageOverTime: 0,
    healingOverTime: 0,
    experienceMultiplier: 1,
    lootMultiplier: 1,
    specialEffects: [],
  };
}

/**
 * Merge every anomaly's effect into one modifier record.
 * @param anomalies rows to fold in; JSON columns are parsed as stored
 * @param baseModifiers seed values to add to (defaults to neutral)
 * @returns a fresh modifier record; `baseModifiers` and every input are untouched
 */
export function applyAnomalyModifiers(
  { anomalies, baseModifiers, }: {
    anomalies: readonly Anomaly[];
    baseModifiers?: AnomalyModifiers;
  },
): AnomalyModifiers {
  const merged = baseModifiers ? structuredClone(baseModifiers,) : neutralModifiers();
  const seenEffects = new Set(merged.specialEffects,);

  for (const anomaly of anomalies) {
    const stats = jsonParseOr<StatModifiers>(anomaly.stat_modifiers, {},);
    for (const [stat, delta,] of Object.entries(stats,)) {
      merged.stats[stat] = (merged.stats[stat] ?? 0) + delta;
    }

    merged.damageOverTime += anomaly.damage_over_time;
    merged.healingOverTime += anomaly.healing_over_time;
    merged.experienceMultiplier *= anomaly.experience_multiplier;
    merged.lootMultiplier *= anomaly.loot_multiplier;

    for (const effect of parseJsonList(anomaly.special_effects,)) {
      // First-seen order wins so the prompt text is stable across calls.
      if (seenEffects.has(effect,)) { continue; }
      seenEffects.add(effect,);
      merged.specialEffects.push(effect,);
    }
  }

  return merged;
}

/**
 * Render one anomaly as a GM-facing prompt line.
 *
 * Only effects that differ from neutral are emitted — a line reading
 * "loot x1" wastes prompt budget and teaches the model that anomalies
 * are usually inert. Signs come from the number itself, so a -1 reads
 * as `-1 luck` rather than needing a separate sign glyph.
 * @param anomaly the row to describe
 * @returns a single line, or an empty string when the anomaly has no effect
 */
export function getAnomalyForPrompt(anomaly: Anomaly,): string {
  const parts: string[] = [`[${anomaly.type}] ${anomaly.name}`,];
  const stats = jsonParseOr<StatModifiers>(anomaly.stat_modifiers, {},);

  for (const [stat, delta,] of Object.entries(stats,)) {
    parts.push(`${delta} ${stat}`,);
  }

  if (anomaly.damage_over_time !== 0) { parts.push(`${anomaly.damage_over_time}/s damage`,); }
  if (anomaly.healing_over_time !== 0) { parts.push(`${anomaly.healing_over_time}/s healing`,); }
  if (anomaly.experience_multiplier !== 1) {
    parts.push(`experience x${anomaly.experience_multiplier}`,);
  }

  if (anomaly.loot_multiplier !== 1) { parts.push(`loot x${anomaly.loot_multiplier}`,); }

  for (const effect of parseJsonList(anomaly.special_effects,)) { parts.push(effect,); }

  return parts.join(", ",);
}
