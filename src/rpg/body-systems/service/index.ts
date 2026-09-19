// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Body System Service
 *
 * Manages physical attributes affecting NSFW interactions:
 * - Physique (stamina, flexibility, sensitivity, endurance)
 * - Size/build classification
 * - Body modifications (piercings, tattoos, etc.)
 * - Heat cycles for species with reproductive cycles
 *
 * Body profile affects arousal buildup, encounter duration, and available actions.
 *
 * The concrete logic lives in isolated dispatcher modules (profile, heat,
 * derived) threaded with an explicit `db` handle. `BodySystemService` remains
 * a class so its methods stay on the prototype and its static derived-stat
 * helpers stay callable directly on the class.
 */
import type { Kysely, } from "kysely";
import type { HeatPhase, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getModifier, } from "../../stats/modifiers";
import type { StatBlock, } from "../../stats/types";
import { getActiveEffects, } from "../../status-effects";
import { Species, } from "../enums";
import {
  calculateArousalModifier as calculateArousalModifierDispatch,
  calculateAvailableActions as calculateAvailableActionsDispatch,
  calculateEncounterDuration as calculateEncounterDurationDispatch,
} from "./derived";
import {
  advanceHeatCycle as advanceHeatCycleDispatch,
  getHeatCycle as getHeatCycleDispatch,
  getHeatEffects as getHeatEffectsDispatch,
} from "./heat";
import {
  addModification as addModificationDispatch,
  getProfile as getProfileDispatch,
  removeModification as removeModificationDispatch,
  updateProfile as updateProfileDispatch,
} from "./profile";
import type {
  BodyModification,
  BodyProfile,
  HeatCycleState,
  HeatEffects,
  UpdateBodyProfileOpts,
} from "./types";

export type {
  BodyModification,
  BodyProfile,
  HeatCycleState,
  HeatEffects,
  UpdateBodyProfileOpts,
} from "./types";

// ── Service ────────────────────────────────────────────────

/** */
export class BodySystemService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Body Profile ──────────────────────────────────────

  /**
   * Get or create a body profile for an actor.
   * @param actorId
   */
  async getProfile(actorId: string,): Promise<BodyProfile> {
    return getProfileDispatch(this.db, actorId,);
  }

  /**
   * Update a body profile.
   * @param actorId
   * @param updates
   */
  async updateProfile(
    actorId: string,
    updates: UpdateBodyProfileOpts,
  ): Promise<boolean> {
    return updateProfileDispatch(this.db, actorId, updates,);
  }

  /**
   * Add a body modification.
   * @param actorId
   * @param modification
   */
  async addModification(
    actorId: string,
    modification: BodyModification,
  ): Promise<void> {
    return addModificationDispatch(this.db, actorId, modification,);
  }

  /**
   * Remove a body modification by index.
   * @param actorId
   * @param index
   */
  async removeModification(actorId: string, index: number,): Promise<boolean> {
    return removeModificationDispatch(this.db, actorId, index,);
  }

  // ── Heat Cycle ────────────────────────────────────────

  /**
   * Get or create a heat cycle for an actor.
   * @param actorId
   * @param species
   */
  async getHeatCycle(
    actorId: string,
    species: string = Species.Human,
  ): Promise<HeatCycleState> {
    return getHeatCycleDispatch(this.db, actorId, species,);
  }

  /**
   * Advance the heat cycle by a number of days.
   * @param actorId
   * @param days
   */
  async advanceHeatCycle(
    actorId: string,
    days: number,
  ): Promise<{ newPhase: HeatPhase; daysUntilNext: number }> {
    return advanceHeatCycleDispatch(this.db, actorId, days,);
  }

  /**
   * Get the current heat effects for an actor.
   * Returns nullified effects for non-heat species.
   * @param actorId
   */
  async getHeatEffects(actorId: string,): Promise<HeatEffects> {
    return getHeatEffectsDispatch(this.db, actorId,);
  }

  /**
   * Current physical status (TASK-035): physique profile merged with
   * live transient state from the shared `status_effect` store.
   *
   * Stamina/endurance live as `character_body_profile` base capacity;
   * transient drain (`exhaustion`, `arousal`, `aphrodisiac`) lives ONLY
   * in shared status rows — no private stamina field. Encounter
   * outcomes (TASK-036) write those same rows via the chemistry/trauma
   * services, so they surface here with no second code path. The CON
   * modifier arrives from the unified stat path, defaulting to 0 when
   * no `character_stats` row exists.
   * @param actorId
   */
  async getPhysicalStatus(actorId: string,): Promise<{
    profile: BodyProfile;
    arousal: number;
    exhaustion: number;
    aphrodisiac: number;
    effectiveStamina: number;
    effectiveDuration: number;
  }> {
    const profile = await getProfileDispatch(this.db, actorId,);
    const effects = await getActiveEffects(this.db, actorId, { category: "physical", },);
    const sum = (id: string,): number => effects
      .filter((e,) => e.effectId === id,)
      .reduce((total, e,) => total + e.magnitude, 0,);
    const arousal = sum("arousal",);
    const exhaustion = sum("exhaustion",);
    const aphrodisiac = sum("aphrodisiac",);
    const effectiveStamina = Math.max(1, profile.stamina - exhaustion,);
    const stats = await this.db
      .selectFrom("character_stats",)
      .select(["str", "dex", "con", "int", "wis", "cha",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    const block: StatBlock = stats
      ? { str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha, }
      : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };
    const effectiveDuration = calculateEncounterDurationDispatch(
      { ...profile, stamina: effectiveStamina, },
      getModifier(block, "con",),
    );
    return { profile, arousal, exhaustion, aphrodisiac, effectiveStamina, effectiveDuration, };
  }

  // ── Derived Stats ─────────────────────────────────────

  /**
   * Calculate effective encounter duration based on stamina + endurance.
   * @param profile
   * @param conModifier - CON modifier from the unified stat path (default 0)
   */
  static calculateEncounterDuration(profile: BodyProfile, conModifier = 0,): number {
    return calculateEncounterDurationDispatch(profile, conModifier,);
  }

  /**
   * Calculate available positions/actions based on flexibility + build.
   * @param profile
   */
  static calculateAvailableActions(profile: BodyProfile,): number {
    return calculateAvailableActionsDispatch(profile,);
  }

  /**
   * Calculate arousal buildup modifier from sensitivity + body.
   * @param profile
   */
  static calculateArousalModifier(profile: BodyProfile,): number {
    return calculateArousalModifierDispatch(profile,);
  }
}
