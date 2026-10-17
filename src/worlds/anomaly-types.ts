// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/anomaly-types.ts — anomaly shapes
 *
 * Split from ./anomalies.ts because the engine's exported types and the
 * service functions cannot share one file under the size-strict gate, and
 * the types are what `applyAnomalyModifiers` and the GM prompt builder are
 * parameterized on — they must stay importable without a database handle.
 */
import type { Selectable, } from "kysely";
import type { AnomalyInteraction, AnomalyType, } from "../db/enums-story/encounters";
import type { LocationAnomalies, } from "../db/schema-core";

export type { AnomalyInteraction, AnomalyType, };

/** Duration value meaning "never expires"; leaves `expires_at` NULL. */
export const PERMANENT_DURATION_SECONDS = -1;

/** Additive stat deltas, e.g. `{ strength: 2, luck: -1 }`. */
export type StatModifiers = Record<string, number>;

/** The merged effect of every active anomaly at a location. */
export interface AnomalyModifiers {
  /** Summed stat deltas across every anomaly. */
  stats: StatModifiers;
  /** Summed damage-over-time across every anomaly. */
  damageOverTime: number;
  /** Summed healing-over-time across every anomaly. */
  healingOverTime: number;
  /** PRODUCT of every anomaly's `experience_multiplier`. */
  experienceMultiplier: number;
  /** PRODUCT of every anomaly's `loot_multiplier`. */
  lootMultiplier: number;
  /** Concatenated special-effect ids, de-duplicated, first-seen order. */
  specialEffects: string[];
}

/**
 * The persisted anomaly as the engine reads and returns it.
 *
 * Aliased to the GENERATED row rather than hand-written: `Selectable`
 * unwraps the `Generated<...>` wrappers the codegen emits for defaulted
 * columns, so the alias is exactly what a SELECT yields and cannot drift
 * from `schema-core.ts` when a column is added.
 */
export type Anomaly = Selectable<LocationAnomalies>;

/** Fields a caller supplies when placing a new anomaly. */
export interface PlaceAnomalyInput {
  /** Anomaly display name; must be non-empty. */
  name: string;
  /** Flavor axis. */
  type: AnomalyType;
  /** Additive stat deltas; defaults to none. */
  statModifiers?: StatModifiers;
  /** Flat damage per second. */
  damageOverTime?: number;
  /** Flat healing per second. */
  healingOverTime?: number;
  /** Multiplier applied to experience gains; defaults to 1. */
  experienceMultiplier?: number;
  /** Multiplier applied to loot yields; defaults to 1. */
  lootMultiplier?: number;
  /** Free-form effect ids the GM layer interprets. */
  specialEffects?: string[];
  /** Seconds to live; -1 (default) means permanent. */
  durationSeconds?: number;
  /** 0..1 chance a discovery roll succeeds. */
  discoveryChance?: number;
  /** Whether interaction is needed before effects resolve. */
  interactionRequired?: AnomalyInteraction;
}
