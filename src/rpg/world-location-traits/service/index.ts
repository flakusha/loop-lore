// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World & Location Traits Service
 *
 * Layer 2 (world) and Layer 3 (location) trait management for characters.
 * World traits apply per-world bonuses/penalties; location traits are
 * more granular per-location effects with equipment overrides.
 *
 * The CRUD / aggregate logic lives in isolated dispatcher modules typed with
 * an explicit `db` handle. `WorldLocationTraitsService` remains a class so its
 * methods stay on the prototype.
 */
import type { Kysely, } from "kysely";
import { getAllTraitsForActor as getAllTraitsForActorDispatch, } from "./aggregate";
import {
  createLocationTrait as createLocationTraitDispatch,
  deleteLocationTrait as deleteLocationTraitDispatch,
  getLocationTraits as getLocationTraitsDispatch,
  updateLocationTrait as updateLocationTraitDispatch,
} from "./location-traits";
import type {
  CreateLocationTraitInput,
  CreateWorldTraitInput,
  LocationTraitRow,
  UpdateLocationTraitInput,
  UpdateWorldTraitInput,
  WorldTraitRow,
} from "./types";
import {
  createWorldTrait as createWorldTraitDispatch,
  deleteWorldTrait as deleteWorldTraitDispatch,
  getWorldTraits as getWorldTraitsDispatch,
  updateWorldTrait as updateWorldTraitDispatch,
} from "./world-traits";

export type {
  CreateLocationTraitInput,
  CreateWorldTraitInput,
  LocationTraitRow,
  UpdateLocationTraitInput,
  UpdateWorldTraitInput,
  WorldTraitCategory,
  WorldTraitRow,
} from "./types";

/**
 * World & Location Traits Service
 *
 * Layer 2 (world) and Layer 3 (location) trait management for characters.
 */
export class WorldLocationTraitsService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<any>,) {}

  // ── World Traits (Layer 2) ───────────────────────────
  /**
   * @param input
   */
  /**
   * @param {CreateWorldTraitInput} input
   * @returns {Promise<WorldTraitRow>}
   */
  async createWorldTrait(
    input: CreateWorldTraitInput,
  ): Promise<WorldTraitRow> {
    return createWorldTraitDispatch(this.db, input,);
  }

  /**
   * @param actorId
   * @param worldId
   */
  /**
   * @param {string} actorId
   * @param {string} worldId
   * @returns {Promise<WorldTraitRow[]>}
   */
  async getWorldTraits(
    actorId: string,
    worldId: string,
  ): Promise<WorldTraitRow[]> {
    return getWorldTraitsDispatch(this.db, actorId, worldId,);
  }

  /**
   * @param id
   * @param input
   */
  /**
   * @param {string} id
   * @param {UpdateWorldTraitInput} input
   * @returns {Promise<WorldTraitRow | undefined>}
   */
  async updateWorldTrait(
    id: string,
    input: UpdateWorldTraitInput,
  ): Promise<WorldTraitRow | undefined> {
    return updateWorldTraitDispatch(this.db, id, input,);
  }

  /**
   * @param id
   */
  /**
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteWorldTrait(id: string,): Promise<boolean> {
    return deleteWorldTraitDispatch(this.db, id,);
  }

  // ── Location Traits (Layer 3) ────────────────────────
  /**
   * @param input
   */
  /**
   * @param {CreateLocationTraitInput} input
   * @returns {Promise<LocationTraitRow>}
   */
  async createLocationTrait(
    input: CreateLocationTraitInput,
  ): Promise<LocationTraitRow> {
    return createLocationTraitDispatch(this.db, input,);
  }

  /**
   * @param actorId
   * @param locationId
   */
  /**
   * @param {string} actorId
   * @param {string} locationId
   * @returns {Promise<LocationTraitRow[]>}
   */
  async getLocationTraits(
    actorId: string,
    locationId: string,
  ): Promise<LocationTraitRow[]> {
    return getLocationTraitsDispatch(this.db, actorId, locationId,);
  }

  /**
   * @param id
   * @param input
   */
  /**
   * @param {string} id
   * @param {UpdateLocationTraitInput} input
   * @returns {Promise<LocationTraitRow | undefined>}
   */
  async updateLocationTrait(
    id: string,
    input: UpdateLocationTraitInput,
  ): Promise<LocationTraitRow | undefined> {
    return updateLocationTraitDispatch(this.db, id, input,);
  }

  /**
   * @param id
   */
  /**
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteLocationTrait(id: string,): Promise<boolean> {
    return deleteLocationTraitDispatch(this.db, id,);
  }

  // ── Aggregate queries ────────────────────────────────
  /**
   * @param actorId
   */
  /**
   * @param {string} actorId
   * @returns {Promise<{ worldTraits: WorldTraitRow[]; locationTraits: LocationTraitRow[]; }>}
   */
  async getAllTraitsForActor(
    actorId: string,
  ): Promise<{
    worldTraits: WorldTraitRow[];
    locationTraits: LocationTraitRow[];
  }> {
    return getAllTraitsForActorDispatch(this.db, actorId,);
  }
}
