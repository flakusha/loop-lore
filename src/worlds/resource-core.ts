// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resource-core.ts — the PURE half of the extraction engine.
 *
 * Everything here is a function of its arguments: no database, no clock, no
 * ambient randomness. `resources.ts` owns the I/O and calls into this for
 * every decision, which is what makes the roll reproducible — a test can
 * assert an exact outcome without seeding a database.
 *
 * DETERMINISM IS THE POINT
 * ------------------------
 * `Math.random()` is banned in this module. Every roll goes through
 * `mulberry32`, seeded from the caller's `rngSeed`. Given the same seed and
 * the same node, `rollExtraction` returns the same verdict on every run,
 * forever — which is what lets a replayed world tick, a re-rolled difficulty
 * test, and a player's retry all agree about what happened.
 */
import { RESOURCE_QUALITY_ORDER, ResourceQuality, } from "../db/enums-story/resources";

/**
 * The fields of a `gathering_node_instances` row that decide a roll. Narrow
 * on purpose: the caller passes exactly what it read, so this module never has
 * to guess at a wider row shape.
 */
export interface ExtractionNodeState {
  /** `gathering_node_instances.extraction_difficulty` — the node's base DC. */
  extraction_difficulty: number;
  /** `gathering_node_instances.quality` — per-instance tier. */
  quality: ResourceQuality;
  /** `gathering_node_instances.remaining_amount`; NULL = infinite. */
  remaining_amount: number | null;
  /** `gathering_node_instances.state` — `depleted` nodes refuse a roll. */
  state: string;
}

/** What the actor brings to the roll. Every field is optional so a caller with
 * no character sheet still gets a well-defined, unbonused roll. */
export interface ExtractionActorModifiers {
  /** Flat bonus from skills/tools; SUBTRACTED from difficulty. */
  abilityBonus?: number;
}

/** One item produced by a successful extraction. */
export interface ExtractionYieldEntry {
  /** An item DEFINITION id (`items.id`) — not a `world_items` instance row. */
  itemId: string;
  quantity: number;
}

/** Raised when an extraction is asked for something that cannot exist. */
export class ResourceError extends Error {
  /**
   * @param code machine-readable reason; routes map it to 404
   * @param message human-readable detail
   */
  constructor(
    public readonly code: "not-found" | "depleted" | "cross-world",
    message: string,
  ) {
    super(message,);
    this.name = "ResourceError";
  }
}

/** A seeded PRNG returning floats in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a 32-bit seeded PRNG.
 *
 * Chosen for being four lines of integer math with no state object: same seed,
 * same stream, on any machine. A pass/fail roll is one comparison against a
 * d100, which does not justify anything heavier, and `Math.random()` cannot be
 * seeded at all.
 * @param seed any 32-bit integer
 * @returns a function producing successive floats in [0, 1)
 */
export function mulberry32(seed: number,): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1,);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61,);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much each quality tier above `common` adds to the DC. */
const QUALITY_DIFFICULTY_STEP = 3;

/** Lower bound on any computed DC, so a huge negative bonus cannot make a
 * node trivially rollable at difficulty 0. */
const MIN_DIFFICULTY = 1;

/** Upper bound, matching a d100: nothing is harder than always failing. */
const MAX_DIFFICULTY = 100;

/**
 * The DC one attempt actually rolls against: the node's stored base, shifted by
 * its quality tier and the actor's bonus, then clamped into [1, 100].
 *
 * Clamping the top matters — without it a legendary node with a terrible base
 * DC would be unwinnable at 100+ and the failure would read as a bug rather
 * than as difficulty.
 * @param nodeInstance the node fields that decide a roll
 * @param actorModifiers optional ability bonus
 * @returns the difficulty to roll against, in [1, 100]
 */
export function calculateExtractionDifficulty(
  nodeInstance: ExtractionNodeState,
  actorModifiers: ExtractionActorModifiers = {},
): number {
  const tierIndex = RESOURCE_QUALITY_ORDER.indexOf(nodeInstance.quality,);
  // An unknown tier (a hand-edited row, a future enum value read by old code)
  // must not crash a roll; treat it as the baseline tier.
  const qualityBonus = tierIndex > 0 ? tierIndex * QUALITY_DIFFICULTY_STEP : 0;
  const bonus = actorModifiers.abilityBonus ?? 0;
  const raw = nodeInstance.extraction_difficulty + qualityBonus - bonus;

  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Math.floor(raw,),),);
}

/** The outcome of one d100 against a DC. */
export interface ExtractionRoll {
  /** True when the d100 was at or above the DC. */
  succeeded: boolean;
  /** The DC this attempt was resolved against, echoed for the audit row. */
  difficulty: number;
  /** The raw d100 rolled, 1–100. Kept so a failure is diagnosable. */
  roll: number;
}

/**
 * Roll d100 against a DC. Succeeds at OR ABOVE the DC, so difficulty 1 is a
 * guaranteed success and difficulty 100 a 1% one.
 * @param difficulty the DC, normally from `calculateExtractionDifficulty`
 * @param rng the seeded generator to draw from
 * @returns the verdict plus both numbers it was decided by
 */
export function rollExtraction(difficulty: number, rng: Rng,): ExtractionRoll {
  const roll = Math.floor(rng() * 100,) + 1;

  return { succeeded: roll >= difficulty, difficulty, roll, };
}
