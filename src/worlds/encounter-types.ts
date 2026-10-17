// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/encounter-types.ts — encounter shapes
 *
 * Split from ./random-encounters.ts for the size gate. Every row type is
 * aliased to its GENERATED Kysely interface so a schema change cannot
 * silently drift from what these functions promise.
 */
import type { Selectable, } from "kysely";
import type {
  EncounterDrivingMode,
  EncounterTemplateState,
  EncounterTravelPhase,
  EncounterTriggerType,
} from "../db/enums-story/encounters";
import type { EncounterRolls, EncounterTemplates, } from "../db/schema-core";

export type { EncounterDrivingMode, EncounterTemplateState, EncounterTravelPhase, };

/** A template row as the roll engine reads it. */
export type EncounterTemplate = Selectable<EncounterTemplates>;

/** One recorded roll. */
export type EncounterRoll = Selectable<EncounterRolls>;

/** What a caller must supply to attempt a roll. */
export interface RollEncounterInput {
  /** World whose pool (plus global templates) is drawn from. */
  worldId: string;
  /** Location the party is at; null for locationless rolls. */
  locationId?: string;
  /** Which candidate pool to draw. */
  triggerType: EncounterTriggerType;
  /** Narrow to one travel step; omitted means "any phase". */
  travelPhase?: EncounterTravelPhase;
  /** Seed for the deterministic candidate pick. */
  rngSeed: number;
  /** Instant the roll is stamped and cooldowns are measured from. */
  now: Date;
}

/**
 * The outcome of `rollEncounter`.
 *
 * `reason` is always populated, including on success — a caller logging
 * why an encounter did NOT fire needs it more than one that did, and a
 * success with no reason is indistinguishable from a bug.
 */
export interface RollEncounterResult {
  /** True only when a template was selected, charged and recorded. */
  triggered: boolean;
  /** The fired template, present iff `triggered`. */
  template?: EncounterTemplate;
  /** The ledger row written for the fire, present iff `triggered`. */
  rollId?: string;
  /** Why the roll resolved the way it did. */
  reason: string;
}

/** Reasons `rollEncounter` reports, in the order they are checked. */
export const ROLL_REASONS = {
  /** The world does not exist. */
  UnknownWorld: "unknown_world",
  /** No enabled template matched this trigger/phase. */
  NoCandidates: "no_candidates",
  /** Every candidate was inside its cooldown window. */
  AllOnCooldown: "all_on_cooldown",
  /** A candidate was drawn but lost its trigger_chance roll. */
  ChanceMissed: "chance_missed",
  /** A template fired and was recorded. */
  Triggered: "triggered",
} as const;

/** One of {@link ROLL_REASONS}. */
export type RollReason = (typeof ROLL_REASONS)[keyof typeof ROLL_REASONS];
