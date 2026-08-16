// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type {
  SeductionSkillCategory,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";

/** Desire profile — what a character finds attractive. */
export interface DesireProfile {
  id: string;
  actorId: string;
  turnOns: string[];
  turnOffs: string[];
  fetishes: string[];
  hardLimits: string[];
  currentDesire: number;
  desireDecayRate: number;
  desireBuildupRate: number;
  createdAt: string;
  updatedAt: string;
}

/** A seduction skill level. */
export interface SeductionSkill {
  id: string;
  actorId: string;
  category: SeductionSkillCategory;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  createdAt: string;
  updatedAt: string;
}

/** Arousal state for a character. */
export interface ArousalState {
  id: string;
  actorId: string;
  worldId: string | null;
  level: number;
  buildupRate: number;
  decayRate: number;
  modifiers: ArousalModifier[];
  lastUpdate: string;
  createdAt: string;
  updatedAt: string;
}

/** A modifier affecting arousal. */
export interface ArousalModifier {
  source: string;
  multiplier: number;
  duration: number;
  remainingTurns: number;
}

/** Result of a seduction attempt. */
export interface SeductionResult {
  /** Whether the seduction succeeded. */
  success: boolean;
  /** Skill check roll (0–100). */
  roll: number;
  /** Difficulty class (0–100). */
  dc: number;
  /** Arousal change for target. */
  arousalDelta: number;
  /** Intimacy change. */
  intimacyDelta: number;
  /** Skill XP gained. */
  xpGained: number;
  /** Narrative description. */
  description: string;
  /** Whether a hard limit was triggered. */
  hardLimitTriggered: boolean;
}

/** Options for a seduction attempt. */
export interface SeductionAttemptOpts {
  database: Kysely<DB>;
  /** Actor performing the seduction. */
  actorId: string;
  /** Target of the seduction. */
  targetId: string;
  /** Skill category used. */
  skillCategory: SeductionSkillCategory;
  /** Description of the approach. */
  approach: string;
  /** Optional world context. */
  worldId?: string | null;
}
