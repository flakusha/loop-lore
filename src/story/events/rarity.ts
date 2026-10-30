// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event Rarity Value Object
 *
 * The SINGLE rarity scale for story events, re-using the canonical loot
 * scale (`ItemRarity` tiers, `RARITY_WEIGHTS` from src/rpg/loot/weights.ts)
 * so items, events and lore share one taxonomy
 * (epic-rarity-extensions: "Single rarity scale across items, events, and
 * lore"). Rarity for a given event rides in the event's existing `data`
 * JSON blob — `src/db/schema-core.ts` is generated, so no schema column
 * lives here (that is box 1's elsewhere-owned migration).
 *
 * All randomness is injected: pass a seeded `mulberry32` (src/autonomy/rng)
 * for reproducible rolls.
 */
import { type ItemRarity, } from "../../db/enums";
import { RARITY_WEIGHTS, } from "../../rpg/loot/weights.js";

/** Event rarity tier — the canonical loot scale, not a second taxonomy. */
export type EventRarity = ItemRarity;

/** Tier list in descending weight order (drives distribution checks). */
export const EVENT_RARITY_TIERS: readonly EventRarity[] = Object.keys(
  RARITY_WEIGHTS,
) as EventRarity[];

/** Rarity → distribution weight. Shared with loot; heavier = more likely. */
export const EVENT_RARITY_WEIGHTS: Record<EventRarity, number> = RARITY_WEIGHTS;

/**
 * Rarity → world-lore promotion priority (`world_lore_entries.priority`).
 * Monotonic with tier so rarer promoted lore sorts ahead in prompt
 * assembly. A rarity absent from the event keeps the historic default 0,
 * which is why `common` deliberately maps to 0 too.
 */
export const EVENT_RARITY_PRIORITY: Record<EventRarity, number> = {
  common: 0,
  uncommon: 10,
  rare: 20,
  epic: 30,
  legendary: 40,
  unique: 50,
  artifact: 60,
};

/** Per-call weight overrides applied over {@link EVENT_RARITY_WEIGHTS}. */
export type RarityWeightOverrides = Partial<Record<EventRarity, number>>;

/**
 * Narrow an arbitrary wire value to an {@link EventRarity}.
 * @param value - Untrusted value (e.g. `event.data.rarity` off the wire)
 * @returns True only for exact loot-scale tier strings
 */
export function isEventRarity(value: unknown,): value is EventRarity {
  return (
    typeof value === "string" &&
    (EVENT_RARITY_TIERS as readonly string[]).includes(value,)
  );
}

/**
 * Parse an untrusted rarity value, collapsing anything unknown to null.
 * Callers treat null as "no rarity" — absence must never throw.
 * @param value - Untrusted value
 * @returns The tier, or null when absent/invalid
 */
export function parseEventRarity(value: unknown,): EventRarity | null {
  return isEventRarity(value,) ? value : null;
}

/** Options for {@link rollRarity}. */
export interface RollRarityOpts {
  /** Injected random source in `[0, 1)` — seed for determinism. */
  rng: () => number;
  /** Weight overrides merged over the shared loot scale. */
  weights?: RarityWeightOverrides;
}

/**
 * Validate a merged weight table.
 * @param weights - Fully-merged tier → weight mapping
 * @returns The same table once proven usable
 * @throws TypeError when any weight is negative/non-finite or the total is 0
 */
function assertUsableWeights(
  weights: Record<EventRarity, number>,
): Record<EventRarity, number> {
  let total = 0;
  for (const tier of EVENT_RARITY_TIERS) {
    const weight = weights[tier];
    if (!Number.isFinite(weight,) || weight < 0) {
      throw new TypeError(
        `rollRarity: weight for "${tier}" must be a finite non-negative number, got ${String(weight,)}`,
      );
    }

    total += weight;
  }

  if (total <= 0) {
    throw new TypeError("rollRarity: total rarity weight must be > 0",);
  }

  return weights;
}

/**
 * Roll a rarity tier, probability proportional to the merged weight table.
 * @param root0 - Options
 * @param root0.rng - Injected random source in `[0, 1)`
 * @param root0.weights - Optional per-tier weight overrides
 * @returns A tier from the shared loot scale
 * @throws TypeError when an override weight is negative/non-finite or all
 *   weights (after merging) total to 0
 */
export function rollRarity({ rng, weights, }: RollRarityOpts,): EventRarity {
  const merged = assertUsableWeights({ ...EVENT_RARITY_WEIGHTS, ...weights, },);
  const total = EVENT_RARITY_TIERS.reduce(
    (sum, tier,) => sum + merged[tier],
    0,
  );

  let point = rng() * total;
  for (const tier of EVENT_RARITY_TIERS) {
    point -= merged[tier];
    if (point < 0) { return tier; }
  }

  // Float rounding can only land here when the last tier's weight is 0;
  // fall back to the heaviest tier rather than returning undefined.
  return EVENT_RARITY_TIERS[0]!;
}
