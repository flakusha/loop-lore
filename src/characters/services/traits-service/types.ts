/**
 * Character Traits Service — types
 *
 * Shared types for permanent/world/location trait operations and the
 * TraitsService interface (single source of truth for the API shape).
 */
import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../../db/schema";
import type {
  LocationTraitCreateInput,
  LocationTraitUpdateInput,
  TraitCreateInput,
  TraitUpdateInput,
  WorldTraitCreateInput,
} from "../../../validation/schemas";

/** Options for creating a permanent trait (body + actorId from params) */
export type CreatePermanentTraitOpts = TraitCreateInput & { actorId: string };
/** Options for creating a world trait (body + actorId/worldId from params) */
export type CreateWorldTraitOpts = WorldTraitCreateInput & { actorId: string; worldId: string };
/** Options for creating a location trait (body + actorId/locationId from params) */
export type CreateLocationTraitOpts = LocationTraitCreateInput & { actorId: string; locationId: string };
/** Options for updating a permanent trait */
export type UpdatePermanentTraitOpts = TraitUpdateInput;
/** Options for updating a world trait */
export type UpdateWorldTraitOpts = TraitUpdateInput;
/** Options for updating a location trait */
export type UpdateLocationTraitOpts = LocationTraitUpdateInput;

/** Permanent trait row (Layer 0) — derived from the DB schema. */
export type PermanentTraitRow = Selectable<DB["character_permanent_traits"]>;
/** World trait row (Layer 2) — derived from the DB schema. */
export type WorldTraitRow = Selectable<DB["character_world_traits"]>;
/** Location trait row (Layer 3) — derived from the DB schema. */
export type LocationTraitRow = Selectable<DB["character_location_traits"]>;

/**
 * The full traits service context handed to dispatchers as `thisL`.
 * The full public API plus the db handle, so any dispatcher can reach
 * sibling methods and the database.
 */
export type TraitsContext = TraitsService & { db: Kysely<DB> };

/**
 * Character Traits Service — public API.
 */
export interface TraitsService {
  getPermanentTraits(actorId: string,): Promise<PermanentTraitRow[]>;
  getPermanentTrait(actorId: string, name: string,): Promise<PermanentTraitRow | undefined>;
  createPermanentTrait(opts: CreatePermanentTraitOpts,): Promise<string>;
  updatePermanentTrait(actorId: string, opts: UpdatePermanentTraitOpts,): Promise<void>;
  deletePermanentTrait(actorId: string, name: string,): Promise<void>;

  getWorldTraits(actorId: string, worldId: string,): Promise<WorldTraitRow[]>;
  getWorldTrait(actorId: string, worldId: string, name: string,): Promise<WorldTraitRow | undefined>;
  createWorldTrait(opts: CreateWorldTraitOpts,): Promise<string>;
  updateWorldTrait(actorId: string, worldId: string, opts: UpdateWorldTraitOpts,): Promise<void>;
  deleteWorldTrait(actorId: string, worldId: string, name: string,): Promise<void>;

  getLocationTraits(actorId: string, locationId: string,): Promise<LocationTraitRow[]>;
  getLocationTrait(actorId: string, locationId: string, name: string,): Promise<LocationTraitRow | undefined>;
  createLocationTrait(opts: CreateLocationTraitOpts,): Promise<string>;
  updateLocationTrait(actorId: string, locationId: string, opts: UpdateLocationTraitOpts,): Promise<void>;
  deleteLocationTrait(actorId: string, locationId: string, name: string,): Promise<void>;

  getAllTraits(
    actorId: string,
    worldId?: string,
    locationId?: string,
  ): Promise<{
    permanent: PermanentTraitRow[];
    world: WorldTraitRow[];
    location: LocationTraitRow[];
  }>;
}
