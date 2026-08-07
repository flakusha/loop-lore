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
import {
  createFantasy as createFantasyDispatch,
  deleteFantasy as deleteFantasyDispatch,
  getActorFantasies as getActorFantasiesDispatch,
  getByCategory as getByCategoryDispatch,
  recordExploration as recordExplorationDispatch,
} from "./crud";
import { attemptDiscovery as attemptDiscoveryDispatch, } from "./discovery";
import type {
  CreateFantasyOpts,
  DiscoveryResult,
  Fantasy,
} from "./types";

export type {
  CreateFantasyOpts,
  DiscoveryResult,
  Fantasy,
  FantasyRequirements,
  FantasyRisks,
  FulfillmentEffects,
} from "./types";

export class FantasyService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a fantasy for an actor.
   */
  async createFantasy(opts: CreateFantasyOpts,): Promise<Fantasy> {
    return createFantasyDispatch(this.db, opts,);
  }

  /**
   * Get all fantasies for an actor.
   */
  async getActorFantasies(actorId: string,): Promise<Fantasy[]> {
    return getActorFantasiesDispatch(this.db, actorId,);
  }

  /**
   * Get fantasies by category.
   */
  async getByCategory(
    actorId: string,
    category: FantasyCategory,
  ): Promise<Fantasy[]> {
    return getByCategoryDispatch(this.db, actorId, category,);
  }

  /**
   * Attempt to discover a new fantasy through play.
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
   */
  async recordExploration(
    fantasyId: string,
    feeling?: string,
  ): Promise<boolean> {
    return recordExplorationDispatch(this.db, fantasyId, feeling,);
  }

  /**
   * Delete a fantasy.
   */
  async deleteFantasy(fantasyId: string,): Promise<boolean> {
    return deleteFantasyDispatch(this.db, fantasyId,);
  }
}
