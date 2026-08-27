// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Relationships Service — factory + merged public API
 *
 * Splits the former `RelationshipsService` class into standalone dispatcher
 * functions (read/write/events) threaded with an explicit `thisL` context,
 * reassembled here by a factory. `RelationshipsService` is a single source of
 * truth: the interface IS the API type and the factory value shares the same
 * exported name (TS declaration merge), so there is no parallel interface.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { logEvent, } from "./events";
import { getRelationship, getRelationships, } from "./read";
import type {
  RelationshipsContext,
  RelationshipsService as RelationshipsServiceIface,
} from "./types";
import { createRelationship, deleteRelationship, updateRelationship, } from "./write";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the `RelationshipsService`
// factory value with a same-named type so one name is both API type and
// constructor.
export interface RelationshipsService extends RelationshipsServiceIface {}

export type {
  CreateRelationshipOpts,
  LogRelationshipEventOpts,
  Relationship,
  RelationshipRow,
  UpdateRelationshipOpts,
} from "./types";

/**
 * Create a RelationshipsService instance.
 *
 * @param db - The database handle (matches the former `new RelationshipsService(db)`)
 * @returns A RelationshipsService bound to the given database
 */
export function RelationshipsService(db: Kysely<DB>,): RelationshipsService {
  const self: RelationshipsContext = {
    db,
    getRelationships: (actorId, worldId,) => getRelationships({ thisL: self, actorId, worldId, },),
    getRelationship: (actorId, targetActorId, worldId,) =>
      getRelationship({ thisL: self, actorId, targetActorId, worldId, },),
    createRelationship: (opts,) => createRelationship({ thisL: self, opts, },),
    updateRelationship: (actorId, targetActorId, worldId, opts,) =>
      updateRelationship({ thisL: self, actorId, targetActorId, worldId, opts, },),
    deleteRelationship: (actorId, targetActorId, worldId,) =>
      deleteRelationship({ thisL: self, actorId, targetActorId, worldId, },),
    logEvent: (opts,) => logEvent({ thisL: self, opts, },),
  };
  return self;
}
