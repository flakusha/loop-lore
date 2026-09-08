// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  NarrativeStyle,
  NsfwEncounterStatus,
  NsfwEncounterType,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";

// ── Types ──────────────────────────────────────────────────

/** A phase within an encounter. */
export interface EncounterPhase {
  name: string;
  duration: number;
  actionsAvailable: string[];
  arousalEffects: ArousalEffect[];
  narrativeBeats: string[];
}

/** Arousal effect within a phase. */
export interface ArousalEffect {
  target: "self" | "partner" | "all";
  amount: number;
  condition?: string;
}

/** Possible outcome of an encounter. */
export interface EncounterOutcome {
  type: "satisfaction" | "dissatisfaction" | "injury" | "bonding" | "discovery";
  probability: number;
  effects: OutcomeEffects;
}

/** Effects of an encounter outcome. */
export interface OutcomeEffects {
  intimacyChange: number;
  moodChange: number;
  satisfactionBonus: number;
  memoryCreated: boolean;
  reputationChange: number;
}

/** An NSFW encounter record. */
export interface NsfwEncounter {
  id: string;
  worldId: string | null;
  encounterType: NsfwEncounterType;
  intensity: ContentIntensity;
  narrativeStyle: NarrativeStyle;
  participants: string[];
  phases: EncounterPhase[];
  currentPhase: number;
  outcomes: EncounterOutcome[];
  contentTags: string[];
  status: NsfwEncounterStatus;
  /** Derived from status — true when completed. */
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Options for creating an encounter. */
export interface CreateEncounterOpts {
  database: Kysely<DB>;
  worldId?: string | null;
  /** Location where the encounter takes place (NSFW suitability check). */
  locationId?: string | null;
  encounterType: NsfwEncounterType;
  intensity?: ContentIntensity;
  narrativeStyle?: NarrativeStyle;
  participants: string[];
  phases?: EncounterPhase[];
  outcomes?: EncounterOutcome[];
  contentTags?: string[];
}

/** Result of advancing an encounter phase. */
export interface AdvancePhaseResult {
  /** Whether the encounter is now complete. */
  complete: boolean;
  /** New current phase index. */
  phaseIndex: number;
  /** Current phase (null if complete). */
  phase: EncounterPhase | null;
  /** Triggered outcomes (if any). */
  triggeredOutcomes: EncounterOutcome[];
}
