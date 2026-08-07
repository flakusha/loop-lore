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
  constructor(private readonly db: Kysely<any>,) {}

  // ── World Traits (Layer 2) ───────────────────────────
  async createWorldTrait(
    input: CreateWorldTraitInput,
  ): Promise<WorldTraitRow> {
    return createWorldTraitDispatch(this.db, input,);
  }

  async getWorldTraits(
    actorId: string,
    worldId: string,
  ): Promise<WorldTraitRow[]> {
    return getWorldTraitsDispatch(this.db, actorId, worldId,);
  }

  async updateWorldTrait(
    id: string,
    input: UpdateWorldTraitInput,
  ): Promise<WorldTraitRow | undefined> {
    return updateWorldTraitDispatch(this.db, id, input,);
  }

  async deleteWorldTrait(id: string,): Promise<boolean> {
    return deleteWorldTraitDispatch(this.db, id,);
  }

  // ── Location Traits (Layer 3) ────────────────────────
  async createLocationTrait(
    input: CreateLocationTraitInput,
  ): Promise<LocationTraitRow> {
    return createLocationTraitDispatch(this.db, input,);
  }

  async getLocationTraits(
    actorId: string,
    locationId: string,
  ): Promise<LocationTraitRow[]> {
    return getLocationTraitsDispatch(this.db, actorId, locationId,);
  }

  async updateLocationTrait(
    id: string,
    input: UpdateLocationTraitInput,
  ): Promise<LocationTraitRow | undefined> {
    return updateLocationTraitDispatch(this.db, id, input,);
  }

  async deleteLocationTrait(id: string,): Promise<boolean> {
    return deleteLocationTraitDispatch(this.db, id,);
  }

  // ── Aggregate queries ────────────────────────────────
  async getAllTraitsForActor(
    actorId: string,
  ): Promise<{
    worldTraits: WorldTraitRow[];
    locationTraits: LocationTraitRow[];
  }> {
    return getAllTraitsForActorDispatch(this.db, actorId,);
  }
}
