// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fantasy Service
 *
 * Manages character fantasies and kinks:
 * - Create/track fantasies with categories and intensity
 * - Discovery through play (random chance based on context)
 * - Fulfillment effects and risk tracking
 * - Feeling progression (neutral → like → love)
 *
 * Fantasies are discovered during encounters or defined at creation.
 *
 * The CRUD / discovery logic lives in isolated dispatcher modules (crud,
 * discovery) threaded with an explicit `db` handle. `FantasyService` remains
 * a class so its methods stay on the prototype.
 */
import type { Kysely, } from "kysely";
import type { FantasyCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { MoodService, } from "../../../characters/services/mood-service";
import type { MoodState, } from "../../../characters/services/mood-service";
import {
  createFantasy as createFantasyDispatch,
  deleteFantasy as deleteFantasyDispatch,
  fulfillFantasy as fulfillFantasyDispatch,
  getActorFantasies as getActorFantasiesDispatch,
  getByCategory as getByCategoryDispatch,
  recordExploration as recordExplorationDispatch,
} from "./crud";
import { attemptDiscovery as attemptDiscoveryDispatch, } from "./discovery";
import type {
  CreateFantasyOpts,
  DiscoveryResult,
  Fantasy,
  FulfillmentEffects,
} from "./types";

export type {
  CreateFantasyOpts,
  DiscoveryResult,
  Fantasy,
  FantasyRequirements,
  FantasyRisks,
  FulfillmentEffects,
} from "./types";

/** */
export class FantasyService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a fantasy for an actor.
   * @param opts
   */
  async createFantasy(opts: CreateFantasyOpts,): Promise<Fantasy> {
    return createFantasyDispatch(this.db, opts,);
  }

  /**
   * Get all fantasies for an actor.
   * @param actorId
   */
  async getActorFantasies(actorId: string,): Promise<Fantasy[]> {
    return getActorFantasiesDispatch(this.db, actorId,);
  }

  /**
   * Get fantasies by category.
   * @param actorId
   * @param category
   */
  async getByCategory(
    actorId: string,
    category: FantasyCategory,
  ): Promise<Fantasy[]> {
    return getByCategoryDispatch(this.db, actorId, category,);
  }

  /**
   * Attempt to discover a new fantasy through play.
   * @param actorId
   * @param context
   * @param discoveryChance
   */
  async attemptDiscovery(
    actorId: string,
    context: string,
    discoveryChance = 0.1,
  ): Promise<DiscoveryResult> {
    return attemptDiscoveryDispatch(this.db, actorId, context, discoveryChance,);
  }

  /**
   * Record exploration of a fantasy (after encounter).
   * @param fantasyId
   * @param feeling
   */
  async recordExploration(
    fantasyId: string,
    feeling?: string,
  ): Promise<boolean> {
    return recordExplorationDispatch(this.db, fantasyId, feeling,);
  }

  /**
   * Fulfill a fantasy for a target: applies intimacy + mood legs,
   * counts the exploration, returns the fulfillment effects.
   * @param fantasyId
   * @param forTarget
   */
  async fulfill(
    fantasyId: string,
    forTarget?: { actorId: string; worldId?: string | null },
  ): Promise<FulfillmentEffects | null> {
    return fulfillFantasyDispatch(this.db, fantasyId, forTarget,);
  }

  /**
   * Mood state via the Character Core API (TASK-041).
   *
   * NSFW callers receive the same `MoodState` shape as non-NSFW
   * callers — this wrapper owns no mood logic, it only threads the
   * service handle. Mood state lives in Character Core
   * (`character_mood`), never in an NSFW-private store.
   * @param actorId
   * @param worldId
   */
  async getMood(actorId: string, worldId?: string,): Promise<MoodState | undefined> {
    return MoodService(this.db,).getMood(actorId, worldId,);
  }

  /**
   * Apply a mood delta with a structured NSFW source tag (TASK-041).
   *
   * Sources are namespaced (`seduction.success`, `encounter.completed`,
   * `fantasy.fulfilled`, ...) so downstream consumers can branch on
   * the tag without re-parsing event history. Delegates to
   * `MoodService.logEvent` — the Character Core primitive.
   * @param actorId
   * @param source
   * @param delta
   * @param worldId
   */
  async applyDelta(
    actorId: string,
    source: string,
    delta: number,
    worldId?: string,
  ): Promise<string> {
    return MoodService(this.db,).logEvent({
      actorId,
      worldId,
      eventType: source,
      happinessDelta: delta,
      source: "nsfw",
      sourceId: source,
    },);
  }

  /**
   * Delete a fantasy.
   * @param fantasyId
   */
  async deleteFantasy(fantasyId: string,): Promise<boolean> {
    return deleteFantasyDispatch(this.db, fantasyId,);
  }
}
