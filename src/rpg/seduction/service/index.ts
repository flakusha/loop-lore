// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Seduction Service
 *
 * Manages desire profiles, seduction skills, and arousal states:
 * - Desire profiles (turn-ons, turn-offs, fetishes, hard limits)
 * - Seduction skills that improve with practice
 * - Arousal state tracking with decay
 * - Seduction attempts with skill checks
 *
 * Integrates with the Intimacy system for relationship context.
 *
 * The concrete logic lives in isolated dispatcher modules (desire, skills,
 * arousal, attempt) threaded with an explicit `db` handle. `SeductionService`
 * remains a class so its methods stay on the prototype — tests construct it
 * with `new SeductionService(db, ...)`.
 */
import type { Kysely, } from "kysely";
import type { SeductionSkillCategory, } from "../../../db/enums";
import type { ContentIntensity, } from "../../../db/enums-character/nsfw";
import type { DB, } from "../../../db/schema";
import { assertNsfwConfigEnabled, } from "../../../nsfw/capability-gate";
import {
  addModifier as addModifierDispatch,
  decayArousal as decayArousalDispatch,
  getArousal as getArousalDispatch,
  modifyArousal as modifyArousalDispatch,
} from "./arousal";
import { attemptSeduction as attemptSeductionDispatch, } from "./attempt";
import {
  getDesireProfile as getDesireProfileDispatch,
  updateDesireProfile as updateDesireProfileDispatch,
} from "./desire";
import {
  awardXp as awardXpDispatch,
  getActorSkills as getActorSkillsDispatch,
  getSkill as getSkillDispatch,
} from "./skills";
import type {
  ArousalModifier,
  ArousalState,
  DesireProfile,
  SeductionAttemptOpts,
  SeductionResult,
  SeductionSkill,
} from "./types";

export type {
  ArousalModifier,
  ArousalState,
  DesireProfile,
  SeductionAttemptOpts,
  SeductionResult,
  SeductionSkill,
} from "./types";

/** */
export class SeductionService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Desire Profiles ───────────────────────────────────

  /**
   * Get or create a desire profile for an actor.
   * @param actorId
   */
  /**
   * @param {string} actorId
   * @returns {Promise<DesireProfile>}
   */
  async getDesireProfile(actorId: string,): Promise<DesireProfile> {
    return getDesireProfileDispatch(this.db, actorId,);
  }

  /**
   * Update a desire profile.
   * @param actorId
   * @param updates
   */
  /**
 * @param {string} actorId
 * @param {Partial<
      Pick<DesireProfile, "turnOns" | "turnOffs" | "fetishes" | "hardLimits" | "desireDecayRate" | "desireBuildupRate">
    >} updates
 * @returns {Promise<boolean>}
 */
  async updateDesireProfile(
    actorId: string,
    updates: Partial<
      Pick<DesireProfile, "turnOns" | "turnOffs" | "fetishes" | "hardLimits" | "desireDecayRate" | "desireBuildupRate">
    >,
  ): Promise<boolean> {
    assertNsfwConfigEnabled();
    return updateDesireProfileDispatch(this.db, actorId, updates,);
  }

  // ── Seduction Skills ──────────────────────────────────

  /**
   * Get or create a seduction skill for an actor.
   * @param actorId
   * @param category
   * @param name
   */
  /**
   * @param {string} actorId
   * @param {SeductionSkillCategory} category
   * @param {string} name
   * @returns {Promise<SeductionSkill>}
   */
  async getSkill(
    actorId: string,
    category: SeductionSkillCategory,
    name: string,
  ): Promise<SeductionSkill> {
    return getSkillDispatch(this.db, actorId, category, name,);
  }

  /**
   * Award XP to a seduction skill and level up if threshold reached.
   * @param actorId
   * @param category
   * @param name
   * @param amount
   */
  /**
   * @param {string} actorId
   * @param {SeductionSkillCategory} category
   * @param {string} name
   * @param {number} amount
   * @returns {Promise<{ leveled: boolean; newLevel: number; }>}
   */
  async awardXp(
    actorId: string,
    category: SeductionSkillCategory,
    name: string,
    amount: number,
  ): Promise<{ leveled: boolean; newLevel: number }> {
    assertNsfwConfigEnabled();
    return awardXpDispatch(this.db, actorId, category, name, amount,);
  }

  /**
   * Get all seduction skills for an actor.
   * @param actorId
   */
  /**
   * @param {string} actorId
   * @returns {Promise<SeductionSkill[]>}
   */
  async getActorSkills(actorId: string,): Promise<SeductionSkill[]> {
    return getActorSkillsDispatch(this.db, actorId,);
  }

  // ── Arousal State ─────────────────────────────────────

  /**
   * Get or create arousal state for an actor.
   * @param actorId
   * @param worldId
   */
  /**
   * @param {string} actorId
   * @param {string | null} worldId
   * @returns {Promise<ArousalState>}
   */
  async getArousal(
    actorId: string,
    worldId: string | null = null,
  ): Promise<ArousalState> {
    return getArousalDispatch(this.db, actorId, worldId,);
  }

  /**
   * Modify arousal level for an actor.
   * @param actorId
   * @param delta
   * @param worldId
   * @param source
   * @param intensityTier - Content-intensity tier bounding the ceiling
   *   (defaults to Moderate); deltas clamp at AROUSAL_CEILING[tier]
   *   (TASK-034).
   */
  /**
   * @param {string} actorId
   * @param {number} delta
   * @param {string | null} worldId
   * @param {string} source
   * @param {ContentIntensity} intensityTier
   * @returns {Promise<number>}
   */
  async modifyArousal(
    actorId: string,
    delta: number,
    worldId: string | null = null,
    source?: string,
    intensityTier?: ContentIntensity,
  ): Promise<number> {
    assertNsfwConfigEnabled();
    return modifyArousalDispatch(this.db, actorId, delta, worldId, source, intensityTier,);
  }

  /**
   * Decay arousal over time.
   * @param actorId
   * @param worldId
   */
  /**
   * @param {string} actorId
   * @param {string | null} worldId
   * @returns {Promise<number>}
   */
  async decayArousal(actorId: string, worldId: string | null = null,): Promise<number> {
    assertNsfwConfigEnabled();
    return decayArousalDispatch(this.db, actorId, worldId,);
  }

  /**
   * Add a modifier to arousal state.
   * @param actorId
   * @param modifier
   * @param worldId
   */
  /**
   * @param {string} actorId
   * @param {Omit<ArousalModifier, "remainingTurns"> & { duration: number }} modifier
   * @param {string | null} worldId
   * @returns {Promise<void>}
   */
  async addModifier(
    actorId: string,
    modifier: Omit<ArousalModifier, "remainingTurns"> & { duration: number },
    worldId: string | null = null,
  ): Promise<void> {
    assertNsfwConfigEnabled();
    return addModifierDispatch(this.db, actorId, modifier, worldId,);
  }

  // ── Seduction Attempts ────────────────────────────────

  /**
   * Attempt a seduction action.
   * @param opts
   */
  /**
   * @param {SeductionAttemptOpts} opts
   * @returns {Promise<SeductionResult>}
   */
  async attemptSeduction(opts: SeductionAttemptOpts,): Promise<SeductionResult> {
    assertNsfwConfigEnabled();
    return attemptSeductionDispatch(this.db, opts,);
  }
}
