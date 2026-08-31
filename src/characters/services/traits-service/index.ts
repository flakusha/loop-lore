// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Traits Service — factory + merged public API
 *
 * Splits the former `TraitsService` class into standalone dispatcher functions
 * (permanent/world/location/bulk) threaded with an explicit `thisL` context,
 * reassembled here by a factory. `TraitsService` is a single source of truth:
 * the interface IS the API type and the factory value shares the same exported
 * name (TS declaration merge), so there is no parallel interface to maintain.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getAllTraits, } from "./bulk";
import {
  createLocationTrait,
  deleteLocationTrait,
  getLocationTrait,
  getLocationTraits,
  updateLocationTrait,
} from "./location";
import {
  createPermanentTrait,
  deletePermanentTrait,
  getPermanentTrait,
  getPermanentTraits,
  updatePermanentTrait,
} from "./permanent";
import type { TraitsContext, TraitsService as TraitsServiceIface, } from "./types";
import {
  createWorldTrait,
  deleteWorldTrait,
  getWorldTrait,
  getWorldTraits,
  updateWorldTrait,
} from "./world";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the `TraitsService` factory
// value with a same-named type so one name is both API type and constructor.

export interface TraitsService extends TraitsServiceIface {}

export type {
  CreateLocationTraitOpts,
  CreatePermanentTraitOpts,
  CreateWorldTraitOpts,
  LocationTraitRow,
  PermanentTraitRow,
  UpdateLocationTraitOpts,
  UpdatePermanentTraitOpts,
  UpdateWorldTraitOpts,
  WorldTraitRow,
} from "./types";

/**
 * Create a TraitsService instance.
 * @param db - The database handle (matches the former `new TraitsService(db)`)
 * @returns A TraitsService bound to the given database
 */
export function TraitsService(db: Kysely<DB>,): TraitsService {
  const self: TraitsContext = {
    db,
    getPermanentTrait: (actorId, name,) => getPermanentTrait({ thisL: self, actorId, name, },),
    getPermanentTraits: (actorId,) => getPermanentTraits({ thisL: self, actorId, },),
    getWorldTrait: (actorId, worldId, name,) => getWorldTrait({ thisL: self, actorId, worldId, name, },),
    getWorldTraits: (actorId, worldId,) => getWorldTraits({ thisL: self, actorId, worldId, },),
    getLocationTrait: (actorId, locationId, name,) => getLocationTrait({ thisL: self, actorId, locationId, name, },),
    getLocationTraits: (actorId, locationId,) => getLocationTraits({ thisL: self, actorId, locationId, },),

    createPermanentTrait: (opts,) => createPermanentTrait({ thisL: self, opts, },),
    updatePermanentTrait: (actorId, opts,) => updatePermanentTrait({ thisL: self, actorId, opts, },),
    deletePermanentTrait: (actorId, name,) => deletePermanentTrait({ thisL: self, actorId, name, },),

    createWorldTrait: (opts,) => createWorldTrait({ thisL: self, opts, },),
    updateWorldTrait: (actorId, worldId, opts,) => updateWorldTrait({ thisL: self, actorId, worldId, opts, },),
    deleteWorldTrait: (actorId, worldId, name,) => deleteWorldTrait({ thisL: self, actorId, worldId, name, },),

    createLocationTrait: (opts,) => createLocationTrait({ thisL: self, opts, },),
    updateLocationTrait: (actorId, locationId, opts,) =>
      updateLocationTrait({ thisL: self, actorId, locationId, opts, },),
    deleteLocationTrait: (actorId, locationId, name,) =>
      deleteLocationTrait({ thisL: self, actorId, locationId, name, },),

    getAllTraits: (actorId, worldId, locationId,) => getAllTraits({ thisL: self, actorId, worldId, locationId, },),
  };
  return self;
}
