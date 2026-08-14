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

export class BodySystemService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Body Profile ──────────────────────────────────────

  /**
   * Get or create a body profile for an actor.
   */
  async getProfile(actorId: string,): Promise<BodyProfile> {
    return getProfileDispatch(this.db, actorId,);
  }

  /**
   * Update a body profile.
   */
  async updateProfile(
    actorId: string,
    updates: UpdateBodyProfileOpts,
  ): Promise<boolean> {
    return updateProfileDispatch(this.db, actorId, updates,);
  }

  /**
   * Add a body modification.
   */
  async addModification(
    actorId: string,
    modification: BodyModification,
  ): Promise<void> {
    return addModificationDispatch(this.db, actorId, modification,);
  }

  /**
   * Remove a body modification by index.
   */
  async removeModification(actorId: string, index: number,): Promise<boolean> {
    return removeModificationDispatch(this.db, actorId, index,);
  }

  // ── Heat Cycle ────────────────────────────────────────

  /**
   * Get or create a heat cycle for an actor.
   */
  async getHeatCycle(
    actorId: string,
    species: string = Species.Human,
  ): Promise<HeatCycleState> {
    return getHeatCycleDispatch(this.db, actorId, species,);
  }

  /**
   * Advance the heat cycle by a number of days.
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
   */
  async getHeatEffects(actorId: string,): Promise<HeatEffects> {
    return getHeatEffectsDispatch(this.db, actorId,);
  }

  // ── Derived Stats ─────────────────────────────────────

  /**
   * Calculate effective encounter duration based on stamina + endurance.
   */
  static calculateEncounterDuration(profile: BodyProfile,): number {
    return calculateEncounterDurationDispatch(profile,);
  }

  /**
   * Calculate available positions/actions based on flexibility + build.
   */
  static calculateAvailableActions(profile: BodyProfile,): number {
    return calculateAvailableActionsDispatch(profile,);
  }

  /**
   * Calculate arousal buildup modifier from sensitivity + body.
   */
  static calculateArousalModifier(profile: BodyProfile,): number {
    return calculateArousalModifierDispatch(profile,);
  }
}
